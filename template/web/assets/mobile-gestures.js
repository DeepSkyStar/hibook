(function() {
    var touchStartX = 0;
    var touchStartY = 0;
    var touchEndX = 0;
    var touchEndY = 0;
    var minSwipeDistance = 50; // Minimum distance for a swipe to be registered
    var maxVerticalDistance = 50; // Maximum vertical distance to ignore scrolling
    var edgeThreshold = 100; // Only allow swipe right from left edge (pixels)

    var touchTarget = null;

    document.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        touchTarget = e.target;
    }, {passive: true});

    document.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe({ target: touchTarget });
    }, {passive: true});

    function handleSwipe(e) {
        var swipeDistanceX = touchEndX - touchStartX;
        var swipeDistanceY = touchEndY - touchStartY;

        // Strict Directional Intent: 
        // If the vertical travel exceeds or equals the horizontal travel, the user's 
        // primary intent is scrolling the page up/down. We must abort the horizontal action.
        if (Math.abs(swipeDistanceY) >= Math.abs(swipeDistanceX)) return;

        // Check if mobile view (simple check based on window width)
        if (window.innerWidth > 768) return;

        // Swipe Right (Open Sidebar)
        if (swipeDistanceX > minSwipeDistance) {
            // User requested a 40% screen width activation zone from the left edge
            var dynamicEdgeThreshold = window.innerWidth * 0.4;
            if (touchStartX < dynamicEdgeThreshold) {
                // Ensure we aren't hijacking a natively scrollable element
                if (!isHorizontallyScrollable(e.target)) {
                    document.body.classList.add('close');
                }
            }
        }

        // Swipe Left (Close Sidebar)
        if (swipeDistanceX < -minSwipeDistance) {
            // Only close if it's currently open (has 'close' class on mobile)
            if (document.body.classList.contains('close')) {
                document.body.classList.remove('close');
            }
        }
    }

    // Helper: checks if the element or its parents are scrollable containers
    function isHorizontallyScrollable(element) {
        while (element && element !== document.body) {
            if (element.scrollWidth > element.clientWidth) {
                var overflowX = window.getComputedStyle(element).overflowX;
                if (overflowX === 'auto' || overflowX === 'scroll') {
                    return true;
                }
            }
            element = element.parentElement;
        }
        return false;
    }
})();
