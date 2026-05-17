const canvas = document.getElementById("viewer");
const ctx = canvas.getContext("2d");

let t = 0;
let playing = true;
let zoom = 1;
let showSignal = true;
let signalData = [];
let panOffset = 0;           // horizontal scroll offset (pixels) when zoomed
let isDragging = false;
let lastMouseX = 0;

/* ===== Controls ===== */

document.getElementById("zoomControl").oninput = e => {
    zoom = 1 / e.target.value;
};

document.getElementById("channelToggle").onchange = e => {
    showSignal = e.target.checked;
};

/* ===== Pan / scroll when zoomed ===== */

canvas.addEventListener("mousedown", e => {
    isDragging = true;
    lastMouseX = e.clientX;
    canvas.classList.add("panning");
});

canvas.addEventListener("mousemove", e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    panOffset -= dx;  // drag right = see earlier in signal
});

canvas.addEventListener("mouseup", () => {
    isDragging = false;
    canvas.classList.remove("panning");
});
canvas.addEventListener("mouseleave", () => {
    isDragging = false;
    canvas.classList.remove("panning");
});

canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const amount = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    panOffset += Math.sign(amount) * 30;
}, { passive: false });

function togglePlay(){
    playing = !playing;
}

/* ===== CSV File Loader ===== */

document.getElementById("fileInput")
.addEventListener("change", function(e){

    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(event){

        const text = event.target.result;

        signalData = text.split(/\r?\n/)
            .map(row=>{
                const parts = row.split(",");
                return parseFloat(parts[parts.length-1]);
            })
            .filter(v => !isNaN(v));

        t = 0;
        panOffset = 0;
    };

    reader.readAsText(file);
});

/* ===== Drawing ===== */

function draw(){

    ctx.clearRect(0,0,canvas.width,canvas.height);

    if(!showSignal || signalData.length === 0) return;

    ctx.beginPath();

    const mid = canvas.height/2;
    const scaleY = 80;

    for(let x=0; x<canvas.width; x++){

        let index = Math.floor((x + t + panOffset) * zoom) % signalData.length;
        let y = mid - scaleY * signalData[index];

        if(x===0) ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
    }

    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.stroke();
}

/* ===== Animation ===== */

function animate(){

    if(playing && signalData.length){
        t += 1;
    }

    draw();
    requestAnimationFrame(animate);
}

animate();
