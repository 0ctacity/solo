#![deny(clippy::all)]

mod automation;
mod application_commands;
mod custom_elements;
mod desktop;
mod diff;
mod element_tree;
#[cfg(target_os = "macos")]
mod macos_event_pump;
mod markdown;
mod motion;
mod native_view;
mod renderer;
mod retained_tree;
mod style;
mod system_appearance;
mod syntax;
mod text;
mod theme;

#[cfg(all(feature = "test-support", target_os = "macos"))]
mod test_renderer;

pub use element_tree::*;
pub use renderer::*;
pub use style::*;
