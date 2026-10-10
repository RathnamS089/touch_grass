use std::time::{Duration, Instant};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    Active,
    Idle,
}

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub idle_threshold: Duration,
    pub intervention_threshold: Duration,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            idle_threshold: Duration::from_secs(60), // 1 minute idle means we left the screen
            intervention_threshold: Duration::from_secs(45 * 60), // 45 minutes of continuous activity
        }
    }
}

pub enum EngineEvent {
    ThresholdExceeded(Duration), // Passes the duration that caused it
}

use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
pub static TODAY_ACTIVE_SECONDS: AtomicU64 = AtomicU64::new(0);

/// 1 while the user is actively at the screen (idle below threshold)
pub static IS_ACTIVE: AtomicU64 = AtomicU64::new(0);
/// Seconds elapsed in the current continuous active session
pub static CURRENT_SESSION_SECONDS: AtomicU64 = AtomicU64::new(0);
/// Active sessions started today (Idle → Active transitions)
pub static SESSIONS_TODAY: AtomicU64 = AtomicU64::new(0);
/// Break nudges shown today (threshold recommendations emitted)
pub static NUDGES_TODAY: AtomicU64 = AtomicU64::new(0);
/// Active seconds per local hour (0-23), for the Dashboard's daily rhythm
pub static HOURLY_ACTIVE_SECONDS: [AtomicU64; 24] = [const { AtomicU64::new(0) }; 24];

/// Live intervention threshold (seconds). The Settings page updates this via
/// the `set_settings` command, so the stepper affects the running engine
/// without a restart. Seeded from EngineConfig at startup.
pub static INTERVENTION_THRESHOLD_SECONDS: AtomicU64 = AtomicU64::new(45 * 60);
/// Live minimum time between reminder nudges (seconds), also from Settings
pub static REMINDER_INTERVAL_SECONDS: AtomicU64 = AtomicU64::new(60 * 60);
/// Local calendar day the "today" counters belong to (days since epoch);
/// on change the counters roll over
static ACTIVE_DAY: AtomicI64 = AtomicI64::new(-1);
pub fn rollover_day() {
    let today = chrono::Datelike::num_days_from_ce(&chrono::Local::now().date_naive()) as i64;
    let previous = ACTIVE_DAY.swap(today, Ordering::Relaxed);
    if previous != -1 && previous != today {
        TODAY_ACTIVE_SECONDS.store(0, Ordering::Relaxed);
        SESSIONS_TODAY.store(0, Ordering::Relaxed);
        NUDGES_TODAY.store(0, Ordering::Relaxed);
        HOURLY_ACTIVE_SECONDS.iter().for_each(|hour| hour.store(0, Ordering::Relaxed));
    }
}

pub struct SessionEngine {
    config: EngineConfig,
    state: SessionState,
    session_start: Option<Instant>,
    /// Nudges already sent in this active session (first at the threshold,
    /// then one per reminder interval — repeats honor the Settings value)
    nudges_sent: u32,
    sender: mpsc::Sender<EngineEvent>,
}

impl SessionEngine {
    pub fn new(config: EngineConfig, sender: mpsc::Sender<EngineEvent>) -> Self {
        Self {
            config,
            state: SessionState::Idle,
            session_start: None,
            nudges_sent: 0,
            sender,
        }
    }

    pub async fn tick(&mut self, idle_duration: Duration) {
        self.tick_at(idle_duration, Instant::now()).await;
    }

    /// Core tick with an injectable clock: `now` is the current Instant, so
    /// tests can drive sessions deterministically without sleeping. `tick()`
    /// delegates with the real clock. Production loop: tick every 1s, so each
    /// active tick accrues ~1 second of TODAY_ACTIVE_SECONDS.
    pub async fn tick_at(&mut self, idle_duration: Duration, now: Instant) {
        rollover_day();
        let is_currently_idle = idle_duration >= self.config.idle_threshold;

        match (self.state, is_currently_idle) {
            (SessionState::Idle, false) => {
                // Transition to Active
                self.state = SessionState::Active;
                self.session_start = Some(now);
                self.nudges_sent = 0;
                IS_ACTIVE.store(1, Ordering::Relaxed);
                CURRENT_SESSION_SECONDS.store(0, Ordering::Relaxed);
                SESSIONS_TODAY.fetch_add(1, Ordering::Relaxed);
                println!("[Engine] Transitioned to Active session.");
            }
            (SessionState::Active, true) => {
                // Transition to Idle
                self.state = SessionState::Idle;
                self.session_start = None;
                self.nudges_sent = 0;
                IS_ACTIVE.store(0, Ordering::Relaxed);
                CURRENT_SESSION_SECONDS.store(0, Ordering::Relaxed);
                println!("[Engine] Transitioned to Idle.");
            }
            (SessionState::Active, false) => {
                // Still Active, check thresholds (live-updatable via Settings)
                TODAY_ACTIVE_SECONDS.fetch_add(1, Ordering::Relaxed);
                let now_local = chrono::Local::now();
                let hour = chrono::Timelike::hour(&now_local) as usize;
                HOURLY_ACTIVE_SECONDS[hour].fetch_add(1, Ordering::Relaxed);
                if let Some(start) = self.session_start {
                    let duration = now.duration_since(start);
                    CURRENT_SESSION_SECONDS.store(duration.as_secs(), Ordering::Relaxed);

                    // First nudge at the "Long session threshold", then a
                    // reminder every "Minimum time between reminders"
                    let threshold = INTERVENTION_THRESHOLD_SECONDS.load(Ordering::Relaxed);
                    let interval = REMINDER_INTERVAL_SECONDS.load(Ordering::Relaxed);
                    let elapsed = duration.as_secs();
                    let due = if self.nudges_sent == 0 {
                        elapsed >= threshold
                    } else {
                        elapsed >= threshold + self.nudges_sent as u64 * interval
                    };
                    if due {
                        self.nudges_sent += 1;
                        println!("[Engine] Nudge #{} after {:?} (threshold {:?}, interval {:?})",
                            self.nudges_sent, duration, Duration::from_secs(threshold), Duration::from_secs(interval));
                        let _ = self.sender.send(EngineEvent::ThresholdExceeded(duration)).await;
                    }
                }
            }
            (SessionState::Idle, true) => {
                // Still Idle, do nothing
            }
        }
    }
}

#[cfg(test)]
pub(crate) static ENGINE_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    /// The nudges read GLOBAL static atomics; parallel tests would overwrite
    /// each other's thresholds, so engine tests run one at a time


    fn lock() -> std::sync::MutexGuard<'static, ()> {
        ENGINE_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Advance the engine through `seconds` active ticks on ONE shared
    /// timeline (`t0` + offset), 1s apart. Caller keeps a single t0 per test
    /// so time never rewinds between helper calls.
    async fn active_ticks(engine: &mut SessionEngine, t0: Instant, from: u64, to: u64) {
        for i in from..=to {
            engine.tick_at(Duration::from_secs(0), t0 + Duration::from_secs(i)).await;
        }
    }

    #[tokio::test]
    async fn first_nudge_fires_at_threshold() {
        let _g = lock();
        let (tx, _rx) = mpsc::channel(100);
        let mut engine = SessionEngine::new(EngineConfig::default(), tx);
        INTERVENTION_THRESHOLD_SECONDS.store(10, Ordering::Relaxed);
        REMINDER_INTERVAL_SECONDS.store(60, Ordering::Relaxed);

        let t0 = Instant::now();
        engine.tick_at(Duration::from_secs(0), t0).await; // Idle → Active
        active_ticks(&mut engine, t0, 1, 9).await;
        assert_eq!(engine.nudges_sent, 0, "no nudge before the threshold");
        active_ticks(&mut engine, t0, 10, 10).await;
        assert_eq!(engine.nudges_sent, 1, "first nudge exactly at the threshold");
    }

    #[tokio::test]
    async fn reminders_repeat_at_the_configured_interval() {
        let _g = lock();
        let (tx, _rx) = mpsc::channel(100);
        let mut engine = SessionEngine::new(EngineConfig::default(), tx);
        INTERVENTION_THRESHOLD_SECONDS.store(10, Ordering::Relaxed);
        REMINDER_INTERVAL_SECONDS.store(15, Ordering::Relaxed);

        let t0 = Instant::now();
        engine.tick_at(Duration::from_secs(0), t0).await;
        active_ticks(&mut engine, t0, 1, 10).await; // 10s
        assert_eq!(engine.nudges_sent, 1, "first nudge at the threshold");
        active_ticks(&mut engine, t0, 11, 25).await; // +15s
        assert_eq!(engine.nudges_sent, 2, "reminder at threshold + interval");
        active_ticks(&mut engine, t0, 26, 40).await; // +15s
        assert_eq!(engine.nudges_sent, 3, "second reminder");
        active_ticks(&mut engine, t0, 41, 54).await; // +14s
        assert_eq!(engine.nudges_sent, 3, "not yet due before the next interval");
    }

    #[tokio::test]
    async fn idle_resets_nudge_cycle() {
        let _g = lock();
        let (tx, _rx) = mpsc::channel(100);
        let mut engine = SessionEngine::new(EngineConfig::default(), tx);
        INTERVENTION_THRESHOLD_SECONDS.store(10, Ordering::Relaxed);
        REMINDER_INTERVAL_SECONDS.store(60, Ordering::Relaxed);

        let t0 = Instant::now();
        engine.tick_at(Duration::from_secs(0), t0).await;
        active_ticks(&mut engine, t0, 1, 10).await;
        assert_eq!(engine.nudges_sent, 1);
        // Step away (idle tick), come back → fresh session, no nudges
        engine.tick_at(Duration::from_secs(120), t0 + Duration::from_secs(11)).await;
        assert_eq!(engine.nudges_sent, 0);
        let t1 = Instant::now();
        engine.tick_at(Duration::from_secs(0), t1).await; // Idle → Active
        active_ticks(&mut engine, t1, 1, 9).await;
        assert_eq!(engine.nudges_sent, 0, "fresh session starts clean");
        active_ticks(&mut engine, t1, 10, 10).await;
        assert_eq!(engine.nudges_sent, 1, "threshold applies again");
    }
}
