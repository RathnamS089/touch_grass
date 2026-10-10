//! macOS Screen Time reader backed by CoreDuet's knowledgeC.db
//! (~/Library/Application Support/Knowledge/knowledgeC.db).
//!
//! macOS Screen Time is derived from CoreDuet's `/app/inFocus` stream: each
//! row is one foreground app session with ZSTARTDATE/ZENDDATE in Apple's
//! reference epoch (seconds since 2001-01-01 00:00:00 UTC). Reading it makes
//! Grounded's numbers match System Settings → Screen Time instead of counting
//! only the seconds since Grounded itself launched.

use rusqlite::OpenFlags;

#[derive(Debug, Clone, Default)]
pub struct ScreenTimeReading {
    /// Total foreground app seconds today (local calendar day), excluding
    /// Grounded itself — this is what macOS Screen Time shows
    pub total_seconds: u64,
    /// Longest single continuous app session today
    pub longest_session_seconds: u64,
    /// Number of foreground app sessions today
    pub sessions: u64,
    /// (local hour 0-23, seconds) for each hour of today that had usage
    pub hourly_seconds: Vec<(u32, u64)>,
}

/// Seconds between the Apple reference epoch (2001-01-01) and the Unix epoch
pub const APPLE_EPOCH_OFFSET: i64 = 978_307_200;
/// knowledgeC.db can hold stale/overlapping rows; cap a single session at one
/// day so a corrupt row can't inflate the total
const MAX_SESSION_SECONDS: i64 = 86_400;
/// Grounded's own bundle id (tauri.conf.json: com.grounded.touchgrass) —
/// time spent in Grounded is break time, never screen time
const GROUNDED_BUNDLE_LIKE: &str = "com.grounded%";

/// Ongoing inFocus sessions keep ZENDDATE at 0 (or null) until the app loses
/// focus; using `now` as their end keeps the total live between syncs.
/// ?1 = local midnight (Apple epoch), ?2 = now (Apple epoch),
/// ?3 = Grounded bundle-id LIKE pattern
const DURATION_EXPR: &str = "CASE WHEN ZENDDATE IS NULL OR ZENDDATE = 0 \
      THEN ?2 - ZSTARTDATE ELSE ZENDDATE - ZSTARTDATE END";

const FILTERS: &str = "ZSTREAMNAME = '/app/inFocus' \
     AND ZSTARTDATE IS NOT NULL AND ZSTARTDATE >= ?1 AND ZSTARTDATE <= ?2 \
     AND (ZVALUESTRING IS NULL OR ZVALUESTRING NOT LIKE ?3)";

/// Run the Screen Time queries against an open knowledgeC-shaped database.
/// Split from `read_screen_time` so tests can exercise the SQL on an
/// in-memory fixture.
fn query_reading(
    conn: &rusqlite::Connection,
    midnight_apple: i64,
    now_apple: i64,
) -> Result<ScreenTimeReading, String> {
    let params = rusqlite::params![midnight_apple, now_apple, GROUNDED_BUNDLE_LIKE];

    let totals_sql = format!(
        "SELECT COALESCE(SUM(dur), 0), COALESCE(MAX(dur), 0), COUNT(*) \
         FROM (SELECT ZSTARTDATE, {DURATION_EXPR} AS dur FROM ZOBJECT WHERE {FILTERS}) \
         WHERE dur > 0 AND dur < {MAX_SESSION_SECONDS}"
    );
    // knowledgeC.db stores ZSTARTDATE/ZENDDATE as REAL (timestamp) columns, so
    // SUM/dur arithmetic yields REAL — read as f64 and round to whole seconds
    let (total, longest, sessions): (f64, f64, f64) = conn
        .query_row(&totals_sql, params, |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| format!("knowledgeC.db query failed: {e}"))?;

    let hourly_sql = format!(
        "SELECT h.h AS hour_idx, COALESCE(SUM( \
           MIN(CASE WHEN s.ZENDDATE IS NULL OR s.ZENDDATE = 0 THEN ?2 ELSE s.ZENDDATE END, ?1 + (h.h + 1) * 3600) \
           - MAX(s.ZSTARTDATE, ?1 + h.h * 3600) \
         ), 0) \
         FROM (SELECT ZSTARTDATE, ZENDDATE, {DURATION_EXPR} AS dur FROM ZOBJECT WHERE {FILTERS}) AS s \
         CROSS JOIN (WITH RECURSIVE hrs(h) AS (SELECT 0 UNION ALL SELECT h + 1 FROM hrs WHERE h < 23) SELECT h FROM hrs) AS h \
         WHERE dur > 0 AND dur < {MAX_SESSION_SECONDS} \
           AND (CASE WHEN s.ZENDDATE IS NULL OR s.ZENDDATE = 0 THEN ?2 ELSE s.ZENDDATE END) > ?1 + h.h * 3600 \
           AND s.ZSTARTDATE < ?1 + (h.h + 1) * 3600 \
         GROUP BY h.h ORDER BY h.h"
    );
    let mut hourly: Vec<(u32, u64)> = Vec::new();
    let mut stmt = conn
        .prepare(&hourly_sql)
        .map_err(|e| format!("knowledgeC.db query failed: {e}"))?;
    let mut rows = stmt.query(params).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let hour: i64 = row.get(0).map_err(|e| e.to_string())?;
        let secs: f64 = row.get(1).map_err(|e| e.to_string())?;
        if (0..=23).contains(&hour) && secs > 0.0 {
            hourly.push((hour as u32, secs.round() as u64));
        }
    }

    Ok(ScreenTimeReading {
        total_seconds: total.round().max(0.0) as u64,
        longest_session_seconds: longest.round().max(0.0) as u64,
        sessions: sessions as u64,
        hourly_seconds: hourly,
    })
}

#[cfg(target_os = "macos")]
pub fn read_screen_time() -> Result<ScreenTimeReading, String> {
    use chrono::{Datelike, Local, TimeZone};

    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let db_path = format!("{home}/Library/Application Support/Knowledge/knowledgeC.db");
    if !std::path::Path::new(&db_path).exists() {
        return Err(
            "knowledgeC.db not found — Screen Time may be disabled on this Mac".to_string(),
        );
    }

    // TCC gate: without Full Disk Access this open fails with
    // SQLITE_CANTOPEN ("unable to open database file")
    let conn = rusqlite::Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| {
            format!(
                "cannot open knowledgeC.db: {e}. Grant Grounded Full Disk Access (System Settings → Privacy & Security → Full Disk Access)"
            )
        })?;

    let now_unix = i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "system clock before 1970".to_string())?
            .as_secs(),
    )
    .map_err(|_| "system clock out of range".to_string())?;

    // Local calendar day boundaries in Apple epoch seconds
    let now_local = Local
        .timestamp_opt(now_unix, 0)
        .single()
        .ok_or("bad local time".to_string())?;
    let midnight_unix = Local
        .with_ymd_and_hms(now_local.year(), now_local.month(), now_local.day(), 0, 0, 0)
        .single()
        .ok_or("bad local midnight".to_string())?
        .timestamp();

    query_reading(
        &conn,
        midnight_unix - APPLE_EPOCH_OFFSET,
        now_unix - APPLE_EPOCH_OFFSET,
    )
}

#[cfg(not(target_os = "macos"))]
pub fn read_screen_time() -> Result<ScreenTimeReading, String> {
    Err("Screen Time sync is only implemented on macOS".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Minimal ZOBJECT fixture with just the columns the queries touch
    fn fixture() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE ZOBJECT (
                 ZSTREAMNAME TEXT,
                 ZSTARTDATE REAL,
                 ZENDDATE REAL,
                 ZVALUESTRING TEXT
             );",
        )
        .unwrap();
        conn
    }

    fn insert(conn: &Connection, start: i64, end: i64, bundle: &str) {
        conn.execute(
            "INSERT INTO ZOBJECT (ZSTREAMNAME, ZSTARTDATE, ZENDDATE, ZVALUESTRING) \
             VALUES ('/app/inFocus', ?1, ?2, ?3)",
            rusqlite::params![start as f64, end as f64, bundle],
        )
        .unwrap();
    }

    const M: i64 = 3_000_000_000; // arbitrary "local midnight" in Apple epoch

    #[test]
    fn sums_today_only_and_excludes_groundedin() {
        let conn = fixture();
        insert(&conn, M + 100, M + 400, "com.apple.Safari"); // 300s today
        insert(&conn, M + 1000, M + 1300, "com.google.Chrome"); // 300s today
        insert(&conn, M + 2000, M + 2300, "com.grounded.touchgrass"); // excluded
        insert(&conn, M - 5000, M - 4700, "com.apple.Safari"); // yesterday, excluded

        let r = query_reading(&conn, M, M + 86_400).unwrap();
        assert_eq!(r.total_seconds, 600);
        assert_eq!(r.sessions, 2);
        assert_eq!(r.longest_session_seconds, 300);
    }

    #[test]
    fn ongoing_sessions_count_up_to_now() {
        let conn = fixture();
        // ZENDDATE = 0 → still in focus; end treated as `now`
        insert(&conn, M + 3600 * 5, 0, "com.apple.Safari");

        let r = query_reading(&conn, M, M + 3600 * 6).unwrap();
        assert_eq!(r.total_seconds, 3600);
        assert_eq!(r.hourly_seconds, vec![(5, 3600)]);
    }

    #[test]
    fn sessions_split_across_hourly_buckets() {
        let conn = fixture();
        insert(
            &conn,
            M + 3600 * 9 + 1800,
            M + 3600 * 10 + 1800,
            "com.apple.Safari",
        );

        let r = query_reading(&conn, M, M + 86_400).unwrap();
        assert_eq!(r.total_seconds, 3600);
        assert_eq!(r.hourly_seconds, vec![(9, 1800), (10, 1800)]);
    }

    #[test]
    fn corrupt_rows_are_capped() {
        let conn = fixture();
        insert(&conn, M, M + 500_000, "com.apple.Safari"); // absurd session
        insert(&conn, M + 100, M + 200, "com.apple.Notes"); // sane session

        let r = query_reading(&conn, M, M + 86_400).unwrap();
        assert_eq!(r.total_seconds, 100); // only the sane row
    }

    #[test]
    fn empty_day_reports_zero() {
        let conn = fixture();
        let r = query_reading(&conn, M, M + 86_400).unwrap();
        assert_eq!(r.total_seconds, 0);
        assert!(r.hourly_seconds.is_empty());
    }

    #[test]
    #[ignore = "manual smoke test against the real knowledgeC.db: the running process needs Full Disk Access"]
    fn live_knowledgec_smoke() {
        match read_screen_time() {
            Ok(r) => println!(
                "[Smoke] macOS Screen Time today: {}s total, {} sessions, longest {}s, hourly {:?}",
                r.total_seconds, r.sessions, r.longest_session_seconds, r.hourly_seconds
            ),
            // Expected without Full Disk Access — the message must name the fix
            Err(e) => println!("[Smoke] unavailable: {e}"),
        }
    }
}
