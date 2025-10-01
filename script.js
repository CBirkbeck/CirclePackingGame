document.addEventListener('DOMContentLoaded', () => {
    const stagingArea = document.getElementById('staging-area');
    const packingArea = document.getElementById('packing-area');
    const containerInfoDisplay = document.getElementById('container-info-display');
    const packedAreaDisplay = document.getElementById('packed-area-display');
    const densityDisplay = document.getElementById('density-display');
    const modeDisplay = document.getElementById('mode-display');
    const resetButton = document.getElementById('reset-button');

    const radiusInput = document.getElementById('coin-radius');
    const radiusDisplay = document.getElementById('radius-display');
    
    const sandboxControls = document.getElementById('sandbox-controls');
    const puzzleControls = document.getElementById('puzzle-controls');
    const sandboxInfo = document.getElementById('sandbox-info');
    const puzzleInfo = document.getElementById('puzzle-info');
    const modeButtons = document.querySelectorAll('.mode-button');

    // --- GLOBAL CONSTANTS ---
    const BOX_SIZE = 300;
    const FIXED_CONTAINER_AREA_SANDBOX = BOX_SIZE * BOX_SIZE;
    const PUZZLE_BOX_SIZE = 300;
    const PUZZLE_COIN_DIAMETER = 89.0;
    const PUZZLE_COIN_RADIUS = PUZZLE_COIN_DIAMETER / 2;
    const RESOLUTION_ITERATIONS = 8; 

    // --- GAME STATE ---
    let currentMode = 'sandbox';
    let COIN_RADIUS_PX;
    let COIN_DIAMETER_PX;
    let COIN_AREA;
    let BOX_SIZE_CURRENT;
    let nextCoinId = 0;
    let packedCoins = [];

    // Dragging state
    let isDragging = false;
    let draggedCoin = null;
    let offset = { x: 0, y: 0 };
    let isNewCoin = false;

    // --- GLOBAL DRAG LISTENERS ---
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);
    document.addEventListener('touchcancel', stopDrag);

    // --- UTILITIES ---

    function getClientCoords(event) {
        if (event.touches) {
            return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
        }
        return event;
    }

    function distance(coin1, coin2) {
        const dx = coin1.x - coin2.x;
        const dy = coin1.y - coin2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * Calculates the proportion of a circle's diameter that is inside the box (0 to 1).
     * This approximates the area inside the box.
     */
    function getAreaProportionInsideBox(coin, boxSize) {
        const R = coin.r;
        const center_x = coin.x;
        const center_y = coin.y;

        let proportion = 1.0;

        // Check X boundaries
        if (center_x < R) { // Left edge overlap
            proportion *= (center_x + R) / (2 * R);
        } else if (center_x > boxSize - R) { // Right edge overlap
            proportion *= (boxSize - center_x + R) / (2 * R);
        }

        // Check Y boundaries
        if (center_y < R) { // Top edge overlap
            proportion *= (center_y + R) / (2 * R);
        } else if (center_y > boxSize - R) { // Bottom edge overlap
            proportion *= (boxSize - center_y + R) / (2 * R);
        }

        // The simple multiplication assumes independent overlaps (like a square intersection), 
        // which is a good, conservative approximation without complex calculus.
        return Math.max(0, Math.min(1, proportion));
    }


    // --- MODE SWITCHING & INIT ---

    function switchMode(mode) {
        if (currentMode === mode) return;

        packedCoins.forEach(coin => coin.el.remove());
        packedCoins = [];
        nextCoinId = 0;

        currentMode = mode;

        modeButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.mode-button[data-mode="${mode}"]`).classList.add('active');
        
        modeDisplay.textContent = mode === 'sandbox' ? 'Sandbox' : 'Puzzle';
        sandboxControls.style.display = mode === 'sandbox' ? 'block' : 'none';
        puzzleControls.style.display = mode === 'puzzle' ? 'block' : 'none';
        sandboxInfo.style.display = mode === 'sandbox' ? 'block' : 'none';
        puzzleInfo.style.display = mode === 'puzzle' ? 'block' : 'none';

        if (mode === 'sandbox') {
            BOX_SIZE_CURRENT = BOX_SIZE;
            COIN_RADIUS_PX = parseInt(radiusInput.value);
            packingArea.style.overflow = 'visible';
            containerInfoDisplay.textContent = `${BOX_SIZE_CURRENT}px x ${BOX_SIZE_CURRENT}px`;
            radiusInput.disabled = false;

        } else {
            BOX_SIZE_CURRENT = PUZZLE_BOX_SIZE;
            COIN_RADIUS_PX = PUZZLE_COIN_RADIUS;
            packingArea.style.overflow = 'hidden'; 
            containerInfoDisplay.innerHTML = `Puzzle Box: ${BOX_SIZE_CURRENT}px x ${BOX_SIZE_CURRENT}px<br>Coin Diameter: ${PUZZLE_COIN_DIAMETER}px`;
            radiusInput.disabled = true;
        }

        initializeBox();
        updateCoinSize(true); 
        updateCountAndDensity();
    }

    function initializeBox() {
        packingArea.style.width = `${BOX_SIZE_CURRENT}px`;
        packingArea.style.height = `${BOX_SIZE_CURRENT}px`;
    }

    function updateCoinSize(forceUpdate) {
        if (currentMode === 'puzzle' && !forceUpdate) {
            return; 
        }
        
        if (currentMode === 'sandbox') {
            COIN_RADIUS_PX = parseInt(radiusInput.value);
            radiusDisplay.textContent = COIN_RADIUS_PX;
        }

        COIN_DIAMETER_PX = COIN_RADIUS_PX * 2;
        COIN_AREA = Math.PI * COIN_RADIUS_PX * COIN_RADIUS_PX; 

        createSupplyCoin(); 

        packedCoins.forEach(coin => {
            coin.r = COIN_RADIUS_PX;
            coin.el.style.width = `${COIN_DIAMETER_PX}px`;
            coin.el.style.height = `${COIN_DIAMETER_PX}px`;
            
            coin.el.style.left = `${coin.x - COIN_RADIUS_PX}px`;
            coin.el.style.top = `${coin.y - COIN_RADIUS_PX}px`;
        });
        
        updateCountAndDensity();
    }
    
    function createSupplyCoin() {
        stagingArea.querySelectorAll('.coin').forEach(c => {
            if(c.classList.contains('supply-coin')) c.remove();
        });
        
        const coinEl = document.createElement('div');
        coinEl.classList.add('coin', 'supply-coin');
        coinEl.style.width = `${COIN_DIAMETER_PX}px`;
        coinEl.style.height = `${COIN_DIAMETER_PX}px`;

        coinEl.addEventListener('mousedown', startDragFromSupply);
        coinEl.addEventListener('touchstart', startDragFromSupply, { passive: false });

        stagingArea.appendChild(coinEl);
    }

    // --- PSEUDO-PHYSICS / COLLISION RESOLUTION ---

    function resolveCollisions(isFinalDrop) {
        const radius = COIN_RADIUS_PX;
        const minSeparation = COIN_DIAMETER_PX;
        
        for (let k = 0; k < RESOLUTION_ITERATIONS; k++) {
            let changed = false;

            // 1. Resolve coin-to-coin overlaps (Applies to BOTH modes)
            for (let i = 0; i < packedCoins.length; i++) {
                let coinA = packedCoins[i];
                let isCoinADragged = (coinA === draggedCoin && !isFinalDrop);

                for (let j = i + 1; j < packedCoins.length; j++) {
                    let coinB = packedCoins[j];
                    let isCoinBDragged = (coinB === draggedCoin && !isFinalDrop);

                    const dist = distance(coinA, coinB);

                    if (dist < minSeparation - 0.001) { 
                        const overlap = minSeparation - dist;
                        const angle = Math.atan2(coinB.y - coinA.y, coinB.x - coinA.x);
                        
                        const pushX = Math.cos(angle) * (overlap / 2);
                        const pushY = Math.sin(angle) * (overlap / 2);

                        if (!isCoinADragged) {
                            coinA.x -= pushX;
                            coinA.y -= pushY;
                        }
                        if (!isCoinBDragged) {
                            coinB.x += pushX;
                            coinB.y += pushY;
                        }
                        changed = true;
                    }
                }
            }
            
            // 2. Clamp coin-to-wall boundaries (Applies ONLY to PUZZLE mode)
            if (currentMode === 'puzzle' || changed) {
                packedCoins.forEach(coin => {
                    if (currentMode === 'puzzle') {
                        const minPos = radius;
                        const maxPos = BOX_SIZE_CURRENT - radius;

                        if (coin.x < minPos || coin.x > maxPos || coin.y < minPos || coin.y > maxPos) {
                            coin.x = Math.max(minPos, Math.min(coin.x, maxPos));
                            coin.y = Math.max(minPos, Math.min(coin.y, maxPos));
                            changed = true;
                        }
                    }

                    // Update the visual position
                    coin.el.style.left = `${coin.x - radius}px`;
                    coin.el.style.top = `${coin.y - radius}px`;
                });
            }

            if (!changed && k > 0) break;
        }
    }


    // --- DRAG LOGIC HANDLERS ---

    function attachDragListenersToPackedCoin(coinEl, coinData) {
        const startDragHandler = (event) => {
            return startDragPackedCoin(event, coinData);
        };

        coinEl.removeEventListener('mousedown', startDragHandler);
        coinEl.removeEventListener('touchstart', startDragHandler);

        coinEl.addEventListener('mousedown', startDragHandler);
        coinEl.addEventListener('touchstart', startDragHandler, { passive: false });
    }

    function startDragPackedCoin(event, coinData) {
        const coords = getClientCoords(event);
        draggedCoin = coinData;
        isNewCoin = false;
        
        const rect = draggedCoin.el.getBoundingClientRect();
        const centerScreenX = rect.left + rect.width / 2;
        const centerScreenY = rect.top + rect.height / 2;
        
        offset.x = coords.clientX - centerScreenX;
        offset.y = coords.clientY - centerScreenY;

        draggedCoin.el.style.position = 'fixed';
        
        draggedCoin.el.style.left = `${centerScreenX - COIN_RADIUS_PX}px`;
        draggedCoin.el.style.top = `${centerScreenY - COIN_RADIUS_PX}px`;

        draggedCoin.el.classList.add('dragging');
        isDragging = true;
        event.preventDefault();
    }
    
    function startDragFromSupply(event) {
        const coords = getClientCoords(event);
        
        const supplyCoinEl = event.currentTarget;
        const newCoinEl = supplyCoinEl.cloneNode(true);
        newCoinEl.classList.remove('supply-coin');
        newCoinEl.style.position = 'fixed'; 
        
        document.body.appendChild(newCoinEl); 

        const newCoinData = {
            id: nextCoinId++,
            el: newCoinEl,
            x: 0, 
            y: 0, 
            r: COIN_RADIUS_PX
        };
        
        draggedCoin = newCoinData;
        isNewCoin = true;
        
        const rect = supplyCoinEl.getBoundingClientRect();
        offset.x = coords.clientX - (rect.left + rect.width / 2);
        offset.y = coords.clientY - (rect.top + rect.height / 2);

        newCoinEl.style.left = `${coords.clientX - COIN_RADIUS_PX}px`;
        newCoinEl.style.top = `${coords.clientY - COIN_RADIUS_PX}px`;

        newCoinEl.classList.add('dragging');
        isDragging = true;
        
        createSupplyCoin(); 
        event.preventDefault();
    }

    function drag(event) {
        if (!isDragging || !draggedCoin) return;

        const coords = getClientCoords(event);
        
        let newCenterScreenX = coords.clientX - offset.x;
        let newCenterScreenY = coords.clientY - offset.y;
        
        const rect = packingArea.getBoundingClientRect();
        
        // 1. Update dragged coin's internal position data based on input
        draggedCoin.x = newCenterScreenX - rect.left;
        draggedCoin.y = newCenterScreenY - rect.top;

        // 2. Resolve collisions (Coin-to-Coin in both modes, Wall-to-Coin in Puzzle mode)
        resolveCollisions(false);
        
        // 3. Update the coin's visual position based on its final (resolved) local position
        const resolvedScreenX = draggedCoin.x + rect.left;
        const resolvedScreenY = draggedCoin.y + rect.top;
        
        draggedCoin.el.style.left = `${resolvedScreenX - COIN_RADIUS_PX}px`;
        draggedCoin.el.style.top = `${resolvedScreenY - COIN_RADIUS_PX}px`;

        updateCountAndDensity();
        event.preventDefault(); 
    }

    function stopDrag() {
        if (!isDragging || !draggedCoin) return;

        draggedCoin.el.classList.remove('dragging');
        const coinEl = draggedCoin.el;
        
        // Final collision resolution and boundary clamping
        resolveCollisions(true);

        const dropTolerance = COIN_DIAMETER_PX; 
        const isCenterNearBox = (draggedCoin.x > -dropTolerance && draggedCoin.x < BOX_SIZE_CURRENT + dropTolerance && 
                                 draggedCoin.y > -dropTolerance && draggedCoin.y < BOX_SIZE_CURRENT + dropTolerance);

        if (isCenterNearBox) {
            
            if (isNewCoin) {
                coinEl.style.position = 'absolute'; 
                packingArea.appendChild(coinEl);
                packedCoins.push(draggedCoin);
                attachDragListenersToPackedCoin(coinEl, draggedCoin);
                
            } else {
                coinEl.style.position = 'absolute';
            }
            
            // Position is already correct from resolveCollisions
            coinEl.style.left = `${draggedCoin.x - COIN_RADIUS_PX}px`;
            coinEl.style.top = `${draggedCoin.y - COIN_RADIUS_PX}px`;

        } else if (isNewCoin) {
            coinEl.remove(); 
        } else {
            // Snap back
            coinEl.style.position = 'absolute';
            coinEl.style.left = `${draggedCoin.x - COIN_RADIUS_PX}px`;
            coinEl.style.top = `${draggedCoin.y - COIN_RADIUS_PX}px`;
        }
        
        isDragging = false;
        draggedCoin = null;

        updateCountAndDensity();
    };

    // --- COUNT AND DENSITY LOGIC ---

    function updateCountAndDensity() {
        let validPackedArea = 0;
        let finalCount = 0;
        
        const COLOR_OVERLAP_THRESHOLD = COIN_DIAMETER_PX - 0.5; 
        
        const boxSize = BOX_SIZE_CURRENT;
        const radius = COIN_RADIUS_PX;
        const containerArea = currentMode === 'sandbox' ? FIXED_CONTAINER_AREA_SANDBOX : BOX_SIZE_CURRENT * BOX_SIZE_CURRENT;

        packedCoins.forEach(coin => coin.el.classList.remove('overlapping'));

        // 1. Check for overlaps and mark coins
        for (let i = 0; i < packedCoins.length; i++) {
            let coinA = packedCoins[i];
            for (let j = i + 1; j < packedCoins.length; j++) {
                let coinB = packedCoins[j];
                const dist = distance(coinA, coinB);
                
                if (dist < COLOR_OVERLAP_THRESHOLD) { 
                    coinA.el.classList.add('overlapping');
                    coinB.el.classList.add('overlapping');
                }
            }
        }
        
        // 2. Calculate valid area/count based on mode
        for(let coin of packedCoins) {
            if (!coin.el.classList.contains('overlapping')) {
                
                const isCenterInsideBox = coin.x >= 0 && coin.x <= boxSize && coin.y >= 0 && coin.y <= boxSize;

                if (currentMode === 'sandbox') {
                    // SANDBOX FIX: Use the approximation function for density calculation
                    const areaProportion = getAreaProportionInsideBox(coin, boxSize);
                    validPackedArea += coin.r * coin.r * Math.PI * areaProportion;
                } else {
                    // PUZZLE: Count only if fully inside the hard boundary zone
                    const isFullyInside = coin.x >= radius && coin.x <= (boxSize - radius) && 
                                          coin.y >= radius && coin.y <= (boxSize - radius);
                    
                    if (isFullyInside) {
                        finalCount++;
                    }
                }
            }
        }

        // 3. Update displays
        
        if (currentMode === 'sandbox') {
            const density = containerArea > 0 ? (validPackedArea / containerArea) * 100 : 0;
            packedAreaDisplay.textContent = validPackedArea.toFixed(2);
            densityDisplay.textContent = `${density.toFixed(2)}%`;
        }
    }

    // --- EVENT LISTENERS ---
    
    radiusInput.addEventListener('input', () => updateCoinSize(false));
    
    modeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            switchMode(e.target.dataset.mode);
        });
    });
    
    resetButton.addEventListener('click', () => {
        if(confirm('Are you sure you want to clear all coins from the box?')) {
            packedCoins.forEach(coin => coin.el.remove());
            packedCoins = [];
            nextCoinId = 0;
            updateCountAndDensity();
        }
    });

    // --- INITIAL SETUP ---
    switchMode('sandbox'); 
});