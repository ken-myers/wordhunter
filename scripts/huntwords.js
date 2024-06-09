const TEMPLATES = {};
const TRIE = new CharTrie();


class ParserError extends Error {
    constructor(message) {
        super(message); 
        this.name = this.constructor.name; 
      
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

async function initWordHunter(){
    initTemplates();
    await initTrie();
}

function isSquare(width, height) {
    const ratio = width / height;
    return 0.5 < ratio && ratio < 2;
}

function initTemplates(){
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const TEMPLATE_HEIGHT = 32;

    //Read templatesheet image
    let templateSheet = cv.imread("templatesheet");
    let templateSheetGray = new cv.Mat();
    cv.cvtColor(templateSheet, templateSheetGray, cv.COLOR_RGBA2GRAY, 0);

    //Extract individual templates from sheet
    for (let i = 0; i < ALPHABET.length; i++){
        let char = ALPHABET[i];
        let template = new cv.Mat();
        let templateRect = new cv.Rect(0, i * TEMPLATE_HEIGHT, TEMPLATE_HEIGHT, TEMPLATE_HEIGHT);
        template = templateSheetGray.roi(templateRect);
        TEMPLATES[char] = template;
    }

    //Remove templateSheet element 
    document.getElementById("templatesheet").remove();
}

async function initTrie(){
    const response = await fetch("./assets/words.txt");
    const text = await response.text();
    let words = text.split("\n").map(word => word.trim());
    for (let word of words) {
        TRIE.addWord(word);
    }
}

function getSquares(contours, eps=0.02){
    let squareContours = [];


    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let epsilon = eps * cv.arcLength(contour, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, epsilon, true);

        if (approx.rows === 4) {
            let boundingRect = cv.boundingRect(approx);
            if (isSquare(boundingRect.width, boundingRect.height)) {
                squareContours.push(approx);
            }
        }
    }

    return squareContours;
}

function huntWords(char_grid){

    //Helper function to recursively hunt words from starting tile
    function* huntWordsFrom(char_grid, row, col, prefix="", visited = null, order = null){
        if (visited == null){
            visited = new Set();
        }   

        if (order == null){
            order = [];
        }

        copiedOrder = [];
        for(let [row, col] of order){
            copiedOrder.push([row, col]);
        }

        order = copiedOrder;
    
        prefix += char_grid[row][col];
        visited.add([row, col].toString()); //Convert to string for deep equality
        order.push([row, col]);

        //Check if prefix itself is a word
        if (TRIE.hasWord(prefix)){
            yield [prefix, order];
        }
    
        if (!TRIE.hasPrefix(prefix)){
            return;
        }
    
        //Find neighbors
        let cols = char_grid[0].length;
        let rows = char_grid.length;
        
        let neighbors = [
            [row-1, col-1], [row-1, col], [row-1, col+1],
            [row, col-1], [row, col+1],
            [row+1, col-1], [row+1, col], [row+1, col+1]
        ];
    
        for (let [nrow, ncol] of neighbors){
            if (nrow >= 0 && nrow < rows && ncol >= 0 && ncol < cols){
                if (!visited.has([nrow, ncol].toString())){
                    yield* huntWordsFrom(char_grid, nrow, ncol, prefix, new Set(visited), order=order);
                }
            }
        }
    
    }
    
    let cols = char_grid[0].length;
    let rows = char_grid.length;

    let results = {};

    //Iterate over all cells
    for (let row = 0; row < rows; row++){
        for (let col = 0; col < cols; col++){
            for (let result of huntWordsFrom(char_grid, row, col)){
                [word, path] = result
                results[word] = {score: wordScore(word), path: path};
            }
        }
    }

    return results;
}

function fuzzyContourPosCompare(a, b, threshold){
    //Get bounding boxes
    let aBox = cv.boundingRect(a);
    let bBox = cv.boundingRect(b);

    //Compare Y first
    if (Math.abs(aBox.y - bBox.y) > threshold * aBox.height){
        if (aBox.y < bBox.y){
            return -1;
        }else {
            return 1;
        }
    }
    //Then X
    else if (Math.abs(aBox.x - bBox.x) > threshold * aBox.width){
        if (aBox.x < bBox.x){
            return -1;
        }else {
            return 1;
        }
    }else{
        return 0;
    }
}

function tryGetTileContourGrid(squareContours, startIdx){



    const AREA_SIMILARITY_THRESHOLD = 0.1;
    const VALID_SIDE_LENGTHS = [4]
    const PADDING_THRESHOLD = 0.3;
    const POSITION_THRESHOLD = 0.2;

    //Helper function to look for square below another in the grid
    function tryFindUnder(squareIdx){
        //Get bounding box of square
        let squareBox = cv.boundingRect(squareContours[squareIdx]);
        
        for (let i = squareIdx + 1; i < squareContours.length; i++){
            let otherBox = cv.boundingRect(squareContours[i]);
            //Check that X is within threshold
            xGood = Math.abs(squareBox.x - otherBox.x) < POSITION_THRESHOLD * squareBox.width;

            //Check Y padding
            yGood = otherBox.y - squareBox.y < (1 + PADDING_THRESHOLD) * squareBox.height;

            if (xGood && yGood){
                return i;
            }
        }

        return null;
        
    }

    //Helper function to look for square to the right of another in the grid
    function tryFindRight(squareIdx){
        
        // console.log("Trying to find right of " + squareIdx)
        // console.log("current contours:")
        // console.log(squareContours)

        //Get bounding box of square
        let squareBox = cv.boundingRect(squareContours[squareIdx]);
        
        for (let i = squareIdx + 1; i < squareContours.length; i++){

            let otherBox = cv.boundingRect(squareContours[i]);
            //Check that Y is within threshold
            yGood = Math.abs(squareBox.y - otherBox.y) < POSITION_THRESHOLD * squareBox.height;

            //Check X padding
            xGood = otherBox.x - squareBox.x < (1 + PADDING_THRESHOLD) * squareBox.width;

            if (yGood && xGood){
                return i;
            }
        }

        return null;
        
    }

    //Helper function to try to build a row of tiles from a starting index
    function tryBuildRow(length, squareIdx){
        let row = [squareIdx];
        
        for (let i = 0; i < length - 1; i++){
            let nextIdx = tryFindRight(row[row.length - 1]);
            if (nextIdx == null){
                return null;
            }
            row.push(nextIdx);
        }
        return row;
    }


    const startContour = squareContours[startIdx];
    squareContours = squareContours.slice(startIdx);
    startIdx = 0;

    let similarContours = [];

    //Filter for only similarly sized contours
    const startArea = cv.contourArea(startContour);
    for (let i = 0; i < squareContours.length; i++){
        let otherArea = cv.contourArea(squareContours[i]);
        if (Math.abs(startArea - otherArea) <= AREA_SIMILARITY_THRESHOLD * startArea){
            similarContours.push(squareContours[i]);
        }
    }

    if (similarContours.length == 0){
        console.log("No similar contours found");
        console.log(squareContours.length)
    }

    squareContours = similarContours;


    //Try to build a grid
    let grid = [];
    sideLength = null;
    for(let i = VALID_SIDE_LENGTHS.length - 1; i >= 0; i--){
        sideLength = VALID_SIDE_LENGTHS[i];

        let candidateGrid = [];

        //Try to build a top row
        let rowStart = startIdx;
        let topRow = tryBuildRow(sideLength, rowStart);
        if (topRow == null){
            continue;
        }

        candidateGrid.push(topRow);

        for(let j = 0; j < sideLength - 1; j++){
            let nextRowStart = tryFindUnder(rowStart);
            if (nextRowStart == null){
                break;
            }
            let nextRow = tryBuildRow(sideLength, nextRowStart);
            if (nextRow == null){
                break;
            }

            candidateGrid.push(nextRow);
            rowStart = nextRowStart;
        }

        if (candidateGrid.length == sideLength){
            grid = candidateGrid;
            break;
        }
    }

    if (grid.length == 0){
        return null;
    }

    //Convert to contours
    let tileContours = [];
    for (let row of grid){
        for (let idx of row){
            tileContours.push(squareContours[idx]);
        }
    }

    //Convert to standard grid
    let tileContourGrid = [];
    for (let i = 0; i < tileContours.length; i += sideLength){
        tileContourGrid.push(tileContours.slice(i, i + sideLength));
    }

    return tileContourGrid;
    
}

function toImageGrid(image){

    const FUZZY_POS_THRESHOLD = 0.1;
    const BINARY_THRESHOLD = 100;

    //Threshold image
    let gray = new cv.Mat();
    cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY, 0);
    let binary = new cv.Mat();
    cv.threshold(gray, binary, BINARY_THRESHOLD, 255, cv.THRESH_BINARY);

    //Find all contours
    let contours = new cv.MatVector();
    cv.findContours(binary, contours, new cv.Mat(), cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE); 
    
    //Filter to squares
    let squareContours = getSquares(contours);

    //Sort squares lef to right, top to bottom
    squareContours.sort((a, b) => fuzzyContourPosCompare(a, b, FUZZY_POS_THRESHOLD));

    if(squareContours.length == 0){
        throw new ParserError("No squares found in image");
    }

    //Try to find a grid of tiles
    let tileContourGrid = null;
    for (let i = 0; i < squareContours.length; i++){
        tileContourGrid = tryGetTileContourGrid(squareContours, i);
        if (tileContourGrid != null){
            break;
        }
    }
    
    if (tileContourGrid == null){
        throw new ParserError("No grid board found");
    }

    //Extract tile images
    tileImageGrid = [];
    for (let row of tileContourGrid){
        let rowImages = [];
        for (let contour of row){
            let box = cv.boundingRect(contour);
            let tileImage = binary.roi(box);
            rowImages.push(tileImage);
        }
        tileImageGrid.push(rowImages);
    }

    return tileImageGrid;
}

//Identifies letter in image with template matching
function getChar(image){

    const MIN_CONFIDENCE = 0.45;

    function marginCrop(toCrop, marginRatio){
        let width = toCrop.cols;
        let height = toCrop.rows;
        let marginWidth = Math.floor(marginRatio * width);
        let marginHeight = Math.floor(marginRatio * height);
        return toCrop.roi(new cv.Rect(marginWidth, marginHeight, width - 2 * marginWidth, height - 2 * marginHeight));
    }

    function preprocess(toPreprocess){
        //Crop
        let cropped = marginCrop(toPreprocess, 0.05);
        
        //Scale to 32x32
        let scaled = new cv.Mat();
        cv.resize(cropped, scaled, new cv.Size(32, 32), 0, 0, cv.INTER_CUBIC); 
        return scaled;
    }

    bestMatch = null;
    bestScore = 0.0;

    image = preprocess(image);

    for(let [char, template] of Object.entries(TEMPLATES)){


        //Preprocess template image
        template = preprocess(template);

        //Match template
        let result = new cv.Mat();
        cv.matchTemplate(image, template, result, cv.TM_CCOEFF_NORMED);

        //Get best match
        let minMax = cv.minMaxLoc(result);
        let score = minMax.maxVal;

        if (score > bestScore){
            bestScore = score;
            bestMatch = char;
        }
    }


    if (bestScore < MIN_CONFIDENCE){
        throw new ParserError("No confident match found");
    }

    return bestMatch;
}

function toCharGrid(imageGrid){
    let charGrid = [];

    for (let row of imageGrid){
        let charRow = [];
        for (let tileImage of row){
            let char = getChar(tileImage);
            charRow.push(char);
        }
        charGrid.push(charRow);
    }

    return charGrid;
}

function wordScore(word){
    const BASE_SCORES = [0, 0, 0, 100, 400, 800, 1400];
    if (word.length < 6){
        return BASE_SCORES[word.length];
    }

    return BASE_SCORES[6] + 200 * (word.length - 6);
}

