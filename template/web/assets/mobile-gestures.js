(function() {
    var touchStartX = 0;
    var touchStartY = 0;
    var touchEndX = 0;
    var touchEndY = 0;
    var minSwipeDistance = 50; // Minimum distance for a swipe to be registered
    var maxVerticalDistance = 50; // Maximum vertical distance to ignore scrolling
    var edgeThreshold = 100; // Only allow swipe right from left edge (pixels)

    document.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});

    document.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, {passive: true});

    function handleSwipe() {
        var swipeDistanceX = touchEndX - touchStartX;
        var swipeDistanceY = touchEndY - touchStartY;

        // Ignore if vertical scroll is significant
        if (Math.abs(swipeDistanceY) > maxVerticalDistance) return;

        // Check if mobile view (simple check based on window width)
        if (window.innerWidth > 768) return;

        // Swipe Right (Open Sidebar)
        if (swipeDistanceX > minSwipeDistance) {
            // Only allow opening if starting from the left edge
            if (touchStartX < edgeThreshold) {
                document.body.classList.add('close');
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
})();
