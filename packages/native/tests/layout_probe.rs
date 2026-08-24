/// Headless layout ground-truth for the tasks-app scroll structure.
///
/// Reproduces, with plain GPUI builders, what build_div emits for the tasks
/// app chain, then reads geometry from the ScrollHandle itself:
///   bounds()     = the scroller's viewport
///   max_offset() = computed scroll range (content - viewport)
///   offset()     = current offset

use std::rc::Rc;

use gpui::{div, px, relative, AnyWindowHandle, Render, ScrollHandle, Size, TestAppContext};
use gpui::prelude::*;

struct ProbeView {
    handle: Rc<ScrollHandle>,
}

impl Render for ProbeView {
    fn render(
        &mut self,
        _window: &mut gpui::Window,
        _cx: &mut gpui::Context<Self>,
    ) -> impl IntoElement {
        let handle = self.handle.clone();

        let mut rows: gpui::Div = div().flex().flex_col();
        for i in 0..60 {
            rows = rows.child(div().h(px(36.0)).w_full().child(format!("row {i}")));
        }
        let tracked = div()
            .id("list")
            .flex_grow(1.0)
            .overflow_y_scroll()
            .min_h(px(0.0))
            .track_scroll(&handle)
            .child(rows);

        // Exact chain emitted by GPUIX: wrapper > retained root > app column.
        div().size_full().child(
            div().size_full().child(
                div().w(relative(1.0)).h(relative(1.0)).flex().flex_col()
                    .child(div().h(px(60.0)))
                    .child(tracked)
                    .child(div().h(px(60.0))),
            ),
        )
    }
}

#[gpui::test]
fn scroller_geometry(cx: &mut TestAppContext) {
    let handle = Rc::new(ScrollHandle::new());
    let window = cx.add_window({
        let handle = handle.clone();
        move |_, _| ProbeView { handle: handle.clone() }
    });
    let window = AnyWindowHandle::from(window);

    let mut window_size = Size::default();
    cx.update_window(window, |_, window, cx| {
        window_size = window.viewport_size();
        println!("window viewport: {:?}", window_size);
        window.draw(cx).clear(cx);
    })
    .unwrap();

    // ScrollHandle is Rc-shared; read geometry straight from it.
    println!("scroller bounds: {:?}", handle.bounds());
    println!("scroller max_offset: {:?}", handle.max_offset());
    println!("scroller offset: {:?}", handle.offset());

    let height = f64::from(handle.bounds().size.height);
    let max_y = f64::from(handle.max_offset().y);
    let window_height = f64::from(window_size.height);
    assert!(
        height < window_height,
        "scroller must be bounded by the column: height={height} window={window_height}"
    );
    assert!(
        max_y > 50.0,
        "expected content overflow (max_offset.y > 50), got {max_y}"
    );

    // Wheel-equivalent mutation must survive the next frame's clamp pass
    // because the clamp now has real range to work with.
    handle.set_offset(gpui::point(px(0.0), px(-200.0)));
    cx.update_window(window, |_, window, cx| {
        window.draw(cx).clear(cx);
    })
    .unwrap();
    println!("offset after wheel+redraw: {:?}", handle.offset());
    assert_eq!(f64::from(handle.offset().y), -200.0);
}
