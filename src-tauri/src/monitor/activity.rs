use std::time::Duration;

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(stateID: u32, eventType: u32) -> f64;
}

/// Returns the duration the system has been idle.
/// Relies on macOS CoreGraphics HID system state.
#[cfg(target_os = "macos")]
pub fn get_idle_duration() -> Duration {
    const K_CG_EVENT_SOURCE_STATE_HID_SYSTEM_STATE: u32 = 1;
    const K_CG_ANY_INPUT_EVENT_TYPE: u32 = 0xFFFFFFFF;
    
    let seconds = unsafe {
        CGEventSourceSecondsSinceLastEventType(
            K_CG_EVENT_SOURCE_STATE_HID_SYSTEM_STATE, 
            K_CG_ANY_INPUT_EVENT_TYPE
        )
    };
    
    // CGEventSourceSecondsSinceLastEventType can theoretically return negative or NaN on error/edge cases
    if seconds.is_nan() || seconds < 0.0 {
        Duration::from_secs(0)
    } else {
        Duration::from_secs_f64(seconds)
    }
}

#[cfg(not(target_os = "macos"))]
pub fn get_idle_duration() -> Duration {
    Duration::from_secs(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_idle_duration() {
        let duration = get_idle_duration();
        println!("Idle duration: {:?}", duration);
        assert!(duration.as_secs_f64() >= 0.0);
    }
}
