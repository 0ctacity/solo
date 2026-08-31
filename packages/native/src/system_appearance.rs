use gpui::WindowAppearance;

/// Collapse GPUI's vibrant variants into the two appearances exposed by the
/// Solid API.
pub(crate) fn normalized_appearance(appearance: WindowAppearance) -> &'static str {
    match appearance {
        WindowAppearance::Light | WindowAppearance::VibrantLight => "light",
        WindowAppearance::Dark | WindowAppearance::VibrantDark => "dark",
    }
}

/// Build the JSON value delivered in `EventPayload.value` for an appearance
/// change. Keeping this serialization at the native boundary ensures that
/// queued events carry the token captured by their subscription.
pub(crate) fn appearance_event_value(token: &str, appearance: WindowAppearance) -> String {
    serde_json::json!({
        "token": token,
        "appearance": normalized_appearance(appearance),
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_vibrant_appearances() {
        assert_eq!(normalized_appearance(WindowAppearance::Light), "light");
        assert_eq!(
            normalized_appearance(WindowAppearance::VibrantLight),
            "light"
        );
        assert_eq!(normalized_appearance(WindowAppearance::Dark), "dark");
        assert_eq!(normalized_appearance(WindowAppearance::VibrantDark), "dark");
    }

    #[test]
    fn serializes_token_and_normalized_appearance() {
        let event: serde_json::Value = serde_json::from_str(&appearance_event_value(
            "appearance-7",
            WindowAppearance::Dark,
        ))
        .unwrap();
        assert_eq!(event["token"], "appearance-7");
        assert_eq!(event["appearance"], "dark");
    }
}
