//Constants
const frameCanvas = document.getElementById('frameCanvas');
const ctx = frameCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
const webcamFeed = document.getElementById('webcamFeed');
const nocam = document.getElementById('noWebcam');
const board = document.getElementById('board');

//App state variables
let camAvailable = false;
let cvReady = false;
let camShowing = true;
let camHeight = 0;
let camWidth = 0;
let lastParseError = "";
let currentWord = "";
let results = {};
let stream = null;
let currentWords = [];

$("#noWebcam").click(() => {
    hideResults();
    showCam();
    recognitionLoop();
});




$(document).ready(main);

function showCam(){

    navigator.mediaDevices.getUserMedia({ video: true }).then((newStream) => {
        stream = newStream;
        webcamFeed.srcObject = stream;
        webcamFeed.onloadedmetadata = () => {


            webcamFeed.play();
            camHeight = webcamFeed.videoHeight;
            camWidth = webcamFeed.videoWidth;

            nocam.style.aspectRatio = `${camWidth}/${camHeight}`;

            frameCanvas.width = camWidth;
            frameCanvas.height = camHeight;
            camAvailable = true;

            webcamFeed.classList.remove('hidden');
            nocam.classList.add('hidden');
            const camHint = document.getElementById('camHint');
            camHint.classList.remove('hidden');
            camShowing = true;
        };
    });
}

function hideCam(message = null){

    if (message != null){
        nocam.innerText = message;
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    nocam.classList.remove('hidden');
    webcamFeed.classList.add('hidden');
    const camHint = document.getElementById('camHint');
    camHint.classList.add('hidden');
    camShowing = false;
}

function showBoard(charGrid){
    const board = document.getElementById('board');
    
    board.innerHTML = `<div id="connectorContainer"></div>`;
    for (let row of charGrid){
        for(let char of row){
            let cell = document.createElement('div');
            cell.innerText = char;
            board.appendChild(cell);
        }
    }

    //Update grid-template
    board.style.gridTemplateColumns = `repeat(${charGrid[0].length}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${charGrid.length}, 1fr)`;

}

function showSolution(charGrid){

    const wordList = document.getElementById('wordList');
    wordList.innerHTML = "";

    let foundWords = Object.keys(results);

    // Sort words by length
    foundWords.sort((a, b) => b.length - a.length);


    // Filter out words that 2 or less characters
    foundWords = foundWords.filter(word => word.length > 2);

    currentWords = foundWords;

    let totalScore = 0;


    for (let word of foundWords){

        let rowElement = document.createElement('div');
        let scoreElement = document.createElement('span');
        let wordElement = document.createElement('span');

        rowElement.classList.add('wordRow');
        wordElement.classList.add('word');
        scoreElement.classList.add('points');

        wordElement.innerText = word;
        scoreElement.innerText = results[word].score;

        rowElement.appendChild(wordElement);
        rowElement.appendChild(scoreElement);
        
        wordElement.addEventListener('click', () => {
            showWord(word);
        });

        totalScore += results[word].score;

        wordList.appendChild(rowElement);

    } 

    showBoard(charGrid);

    const totalScoreElement = document.getElementById('totalScore');
    totalScoreElement.innerText = "SCORE: "+ totalScore;

    const wordCountElement = document.getElementById('wordCount');
    wordCountElement.innerText = "WORDS: "+ foundWords.length;

    let firstWord = foundWords[0];
    showWord(firstWord);

    const solutionBox = document.getElementById('solutionBox');
    solutionBox.classList.remove('hidden');
}

function hideResults(){
    const solutionBox = document.getElementById('solutionBox');
    solutionBox.classList.add('hidden');
}

function imageDifference(image1, image2){

    let gray1 = new cv.Mat();
    cv.cvtColor(image1, gray1, cv.COLOR_RGBA2GRAY);

    let gray2 = new cv.Mat();
    cv.cvtColor(image2, gray2, cv.COLOR_RGBA2GRAY);

    let diff = new cv.Mat();
    cv.absdiff(gray1, gray2, diff);
    
    let thresholded = new cv.Mat();
    cv.threshold(diff, thresholded, 15, 255, cv.THRESH_BINARY);

    let nonZero = cv.countNonZero(thresholded);
    let totalPixels = diff.total();

    return nonZero / totalPixels;
}

function recognitionLoop(lastImage = null){
    const INTERVAL = 300;
    // const DIFF_THRESHOLD = 0.7;
    if(!camAvailable || !cvReady || !camShowing){
        setTimeout(recognitionLoop, INTERVAL);
        return;
    }

    const webcamFeed = document.getElementById('webcamFeed');

    // Draw webcam frame to canvas

    ctx.drawImage(webcamFeed, 0, 0, camWidth, camHeight);
    
    try{
        let image = cv.imread(frameCanvas);
        let imageGrid = toImageGrid(image);
        let charGrid = toCharGrid(imageGrid);   
        results = huntWords(charGrid);

        showSolution(charGrid);

        hideCam("Click to do another scan.");
    }catch(e){
        if (!(e instanceof ParserError)){
            console.error(e);
        }else{
            lastParseError = e.message;
        }

        setTimeout(recognitionLoop, INTERVAL);
        return;
    }
}

function nextWord(){

    if (camShowing){
        return;
    }

    let currentIndex = currentWords.indexOf(currentWord);
    let nextIndex = (currentIndex + 1) % currentWords.length;
    let nextWord = currentWords[nextIndex];
    showWord(nextWord);
}

function prevWord(){
    if (camShowing){
        return;
    }

    let currentIndex = currentWords.indexOf(currentWord);
    let prevIndex = (currentIndex - 1 + currentWords.length) % currentWords.length;
    let prevWord = currentWords[prevIndex];
    showWord(prevWord);
}

function showWord(word){


    const result = results[word];
    const path = result.path;

    currentWord = word;

    //Find corresponding word row
    let wordRow = null;
    let wordRows = document.getElementsByClassName('wordRow');
    for (let row of wordRows){
        row.classList.remove('selected');
        if (row.children[0].innerText == word){
            wordRow = row;
            //Remove old selections
        }
    }

    wordRow.classList.add('selected');

    //If word is not in view, scroll to it
    let wordList = document.getElementById('wordList');
    let wordListRect = wordList.getBoundingClientRect();
    let wordRowRect = wordRow.getBoundingClientRect();

    if (wordRowRect.bottom > wordListRect.bottom){
        wordList.scrollTop += wordRowRect.bottom - wordListRect.bottom;
    }else if (wordRowRect.top < wordListRect.top){
        wordList.scrollTop -= wordListRect.top - wordRowRect.top;
    }


    //Highlight tiles

    //Remove previous highlights
    let highlighted = document.getElementsByClassName('highlight');
    for (let i = highlighted.length - 1; i >= 0; i--){
        highlighted[i].classList.remove('highlight');
    }

    //Hightlight path
    for(let [row, col] of path){

        let childNum = 1 + row * 4 + col;
        let child = board.children[childNum];
        child.classList.add('highlight');
    }

    //Connectors

    const connectorContainer = document.getElementById('connectorContainer');
    connectorContainer.innerHTML = "";

    const boardStyle = window.getComputedStyle(board);
    const tileStyle = window.getComputedStyle(board.children[1]);

    const boardPadding = boardStyle.padding.slice(0, -2) * 1;
    const boardGap = boardStyle.gap.slice(0, -2) * 1;
    const tileWidth = tileStyle.width.slice(0, -2) * 1;
    const thickness = 13;
    const length = tileWidth + boardGap + thickness;
    
    console.log("tileWidth: ", tileWidth);
    console.log("thickness: ", thickness);
    console.log("length: ", length);
    console.log("boardGap: ", boardGap);
    console.log("boardPadding: ", boardPadding);

    const SQRT2 = 1.414213562;

    const diagLength = SQRT2 * (tileWidth + boardGap) + thickness;
 
    const startPos = boardPadding + tileWidth / 2 - thickness / 2;
    const stepSize = tileWidth + boardGap;

    for(let i = 0; i < path.length - 1; i++){
        let [row1, col1] = path[i];
        let [row2, col2] = path[i+1];


        let dx = col2 - col1;
        let dy = row2 - row1;


        //Clockwise from right in increments of 45 degrees:
        // 0 is right
        // 1 is down-right
        // 2 is down
        // 3 is down-left
        // 4 is left
        // 5 is up-left
        // 6 is up
        // 7 is up-right

        const directionMap = {
            "1,0": 0, //right
            "1,1": 1, //down-right
            "0,1": 2, //down
            "-1,1": 3, //down-left
            "-1,0": 4, //left
            "-1,-1": 5, //up-left
            "0,-1": 6, //up
            "1,-1": 7 //up-right
        };

        let direction = directionMap[`${dx},${dy}`];

        let posTop = startPos + row1 * stepSize;
        let posLeft = startPos + col1 * stepSize;

     
        let connector = document.createElement('div');
        connector.classList.add('connector');
        connector.style.top = posTop + "px";
        connector.style.left = posLeft + "px";

        connector.style.width = length + "px";
        connector.style.height = thickness + "px";
        connector.style.transformOrigin = `${thickness/2}px ${thickness/2}px`;

        //Diagonals
        if (direction % 2 == 1){
            
            connector.style.width = diagLength + "px";

            // Big border radius to prevent rotated corners from showing
            
            // Don't blunt beginning of word
            if (i != 0){
                connector.style.borderTopLeftRadius = `${thickness/2}px`;
                connector.style.borderBottomLeftRadius = `${thickness/2}px`;
            }
            // Don't blunt end of word
            if (i != path.length - 2){
                connector.style.borderTopRightRadius = `${thickness/2}px`;
                connector.style.borderBottomRightRadius = `${thickness/2}px`;
            }
        }

        let degrees = 45 * direction;

        connector.style.transform = `rotate(${degrees}deg)`;
        
        connectorContainer.appendChild(connector);
    }
}


function bindArrowKeys(){

    // Listen to arrow keys
    document.addEventListener('keydown', (event) => {


        if (event.key == "ArrowRight" || event.key == "ArrowDown"){
            event.preventDefault();
            nextWord();
        }else if (event.key == "ArrowLeft" || event.key == "ArrowUp"){
            event.preventDefault();
            prevWord();
        }
    });
}

function main() {
    bindArrowKeys();
    showCam();
    recognitionLoop();
}

var Module = {
    onRuntimeInitialized: function() {
        initWordHunter();
        cvReady = true;
    }
}