document.addEventListener('DOMContentLoaded', () => {
    const stagingArea = document.getElementById('staging-area');
    const packingArea = document.getElementById('packing-area');
    const coinCountDisplay = document.getElementById('coin-count-display');
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

    // --- PUZZLE SCALED CONSTANTS (Maintains the 64.27mm / 19.05mm ratio ≈ 3.37) ---
    const PUZZLE_BOX_SIZE = 300;
    const PUZZLE_COIN_DIAMETER = 89.0; // 300 / (64.27 / 19.05) ≈ 88.75px, rounded to 89
    const PUZZLE_COIN_RADIUS = PUZZLE_COIN_DIAMETER / 2; // 44.5 px
    const FIXED_CONTAINER_AREA_PUZZLE = PUZZLE_BOX_SIZE * PUZZLE_BOX_SIZE;

    // --- GAME STATE ---
    let currentMode = 'sandbox';
    let COIN_RADIUS_PX;
    let COIN_DIAMETER_PX;
    let COIN_AREA;
    let BOX_SIZE_CURRENT; // Dynamic box size based on mode
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

    // --- MODE SWITCHING & INIT ---

    function switchMode(mode) {
        if (currentMode === mode) return;

        // Clear the board on mode switch
        packedCoins.forEach(coin => coin.el.remove());
        packedCoins = [];
        nextCoinId = 0;

        currentMode = mode;

        // 1. Update UI visibility
        modeButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.mode-button[data-mode="${mode}"]`).classList.add('active');
        
        modeDisplay.textContent = mode === 'sandbox' ? 'Sandbox' : 'Puzzle';
        sandboxControls.style.display = mode === 'sandbox' ? 'block' : 'none';
        puzzleControls.style.display = mode === 'puzzle' ? 'block' : 'none';
        sandboxInfo.style.display = mode === 'sandbox' ? 'block' : 'none';
        puzzleInfo.style.display = mode === 'puzzle' ? 'block' : 'none';

        // 2. Set box rules and coin size
        if (mode === 'sandbox') {
            // Soft Edge Sandbox (Variable Coin Size)
            BOX_SIZE_CURRENT = SANDBOX_BOX_SIZE;
            COIN_RADIUS_PX = parseInt(radiusInput.value);
            packingArea.style.overflow = 'visible'; // Soft edges
            containerInfoDisplay.textContent = `${BOX_SIZE_CURRENT}px x ${BOX_SIZE_CURRENT}px`;
            radiusInput.disabled = false;

        } else {
            // Hard Edge Puzzle (Fixed Penny Coin)
            BOX_SIZE_CURRENT = PUZZLE_BOX_SIZE;
            COIN_RADIUS_PX = PUZZLE_COIN_RADIUS;
            packingArea.style.overflow = 'hidden'; // Hard edges
            containerInfoDisplay.innerHTML = `Puzzle Box: 300px x 300px<br>Coin Diameter: ${PUZZLE_COIN_DIAMETER}px`;
            radiusInput.disabled = true;
        }

        initializeBox();
        updateCoinSize(true); // Force update coin size/supply
        updateCountAndDensity();
    }

    function initializeBox() {
        // Ensure box size is explicitly set to 300x300 in JS
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
            
            // Reposition coin based on its new size relative to its center (x, y)
            coin.el.style.left = `${coin.x - COIN_RADIUS_PX}px`;
            coin.el.style.top = `${coin.y - COIN_RADIUS_PX}px`;
        });
        
        updateCountAndDensity();
    }
    
    function createSupplyCoin() {
        // Clear existing supply coins
        stagingArea.querySelectorAll('.coin').forEach(c => {
            if(c.classList.contains('supply-coin')) c.remove();
        });
        
        const coinEl = document.createElement('div');
        coinEl.classList.add('coin', 'supply-coin');
        // Ensure coin size is set based on current variables
        coinEl.style.width = `${COIN_DIAMETER_PX}px`;
        coinEl.style.height = `${COIN_DIAMETER_PX}px`;

        coinEl.addEventListener('mousedown', startDragFromSupply);
        coinEl.addEventListener('touchstart', startDragFromSupply, { passive: false });

        stagingArea.appendChild(coinEl);
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
        
        const newCenterScreenX = coords.clientX - offset.x;
        const newCenterScreenY = coords.clientY - offset.y;

        draggedCoin.el.style.left = `${newCenterScreenX - COIN_RADIUS_PX}px`;
        draggedCoin.el.style.top = `${newCenterScreenY - COIN_RADIUS_PX}px`;

        event.preventDefault(); 
    }

    function stopDrag() {
        if (!isDragging || !draggedCoin) return;

        draggedCoin.el.classList.remove('dragging');
        const coinEl = draggedCoin.el;
        const rect = packingArea.getBoundingClientRect();

        const coinCenterScreenX = parseFloat(coinEl.style.left) + COIN_RADIUS_PX;
        const coinCenterScreenY = parseFloat(coinEl.style.top) + COIN_RADIUS_PX;

        const dropTolerance = COIN_DIAMETER_PX; 
        
        const droppedNearBox = (
            coinCenterScreenX > rect.left - dropTolerance && 
            coinCenterScreenX < rect.right + dropTolerance && 
            coinCenterScreenY > rect.top - dropTolerance && 
            coinCenterScreenY < rect.bottom + dropTolerance
        );

        let droppedInFinalArea = false;
        let requiresRemoval = false;

        if (currentMode === 'sandbox') {
            // SANDBOX: Center must be near the box to be considered packed.
            droppedInFinalArea = (
                coinCenterScreenX > rect.left - COIN_RADIUS_PX && 
                coinCenterScreenX < rect.right + COIN_RADIUS_PX && 
                coinCenterScreenY > rect.top - COIN_RADIUS_PX && 
                coinCenterScreenY < rect.bottom + COIN_RADIUS_PX
            );
            
        } else {
            // PUZZLE: Coins must be fully inside (Hard Boundary)
            droppedInFinalArea = (
                coinCenterScreenX >= rect.left + COIN_RADIUS_PX && 
                coinCenterScreenX <= rect.right - COIN_RADIUS_PX && 
                coinCenterScreenY >= rect.top + COIN_RADIUS_PX && 
                coinCenterScreenY <= rect.bottom - COIN_RADIUS_PX
            );
             requiresRemoval = true; 
        }

        if (droppedInFinalArea) {
            
            const localX = coinCenterScreenX - rect.left;
            const localY = coinCenterScreenY - rect.top;

            if (isNewCoin) {
                coinEl.style.position = 'absolute'; 
                packingArea.appendChild(coinEl);
                packedCoins.push(draggedCoin);
                attachDragListenersToPackedCoin(coinEl, draggedCoin);
                
            } else {
                coinEl.style.position = 'absolute';
            }
            
            // Update coin position
            draggedCoin.x = localX;
            draggedCoin.y = localY;
            
            coinEl.style.left = `${draggedCoin.x - COIN_RADIUS_PX}px`;
            coinEl.style.top = `${draggedCoin.y - COIN_RADIUS_PX}px`;

        } else if (isNewCoin || (requiresRemoval && !isNewCoin)) {
            // New Coin dropped outside OR an existing PUZZLE coin was dropped partially outside
            coinEl.remove(); 
            if (!isNewCoin) { 
                 packedCoins = packedCoins.filter(c => c.id !== draggedCoin.id);
            }
        } else {
            // Snap back to last valid absolute position
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
        const minSeparation = COIN_DIAMETER_PX;
        const boxSize = BOX_SIZE_CURRENT;
        const radius = COIN_RADIUS_PX;
        const containerArea = currentMode === 'sandbox' ? FIXED_CONTAINER_AREA_SANDBOX : FIXED_CONTAINER_AREA_PUZZLE;

        packedCoins.forEach(coin => coin.el.classList.remove('overlapping'));

        // 1. Check for overlaps and mark coins
        for (let i = 0; i < packedCoins.length; i++) {
            let coinA = packedCoins[i];
            for (let j = i + 1; j < packedCoins.length; j++) {
                let coinB = packedCoins[j];
                const dist = distance(coinA, coinB);
                
                if (dist < minSeparation) {
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
                    // SANDBOX: Density based on full coin area if center is in the box
                    if (isCenterInsideBox) {
                        validPackedArea += COIN_AREA;
                    }
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
        coinCountDisplay.textContent = currentMode === 'sandbox' ? packedCoins.length : finalCount;

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