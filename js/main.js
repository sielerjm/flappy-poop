

//----------------------------------------------------vars---------------------------------------------------
var myGamePiece;
var myObstacles = [];
var myScore;
var gameover;
var myGameArea = {
    canvas : document.createElement("canvas"),
    start : function() {
        this.canvas.width = 1400;
        this.canvas.height =800;
        this.context = this.canvas.getContext("2d");
        document.body.insertBefore(this.canvas, document.body.childNodes[0]);
        this.frameNo = 0; //a property for counting frames
        this.interval = setInterval(updateGameArea, 6);//run this function every 20th millisecond
        window.addEventListener('keydown', function (e) {
            myGameArea.keys = (myGameArea.keys || []);
            myGameArea.keys[e.keyCode] = true;
            myGamePiece.width = 65;
            myGamePiece.height = 65;
            myGamePiece.image.src = "img/poop_md.png";
            jump();
            accelerate(0.05);
        })
        window.addEventListener('keyup', function (e) {
            myGameArea.keys[e.keyCode] = false;
            myGamePiece.width = 70;
            myGamePiece.height = 70;
            myGamePiece.image.src = "img/poop_md.png";
            accelerate(0.05);
        })
        window.addEventListener('mousedown', function (e) {
            myGameArea.keys = (myGameArea.keys || []);
            myGameArea.keys[e.keyCode] = true;
            myGamePiece.width = 65;
            myGamePiece.height = 65;
            myGamePiece.image.src = "img/poop_md.png";
            jump();
            accelerate(0.05);
        })
        window.addEventListener('mouseup', function (e) {
            myGameArea.keys[e.keyCode] = false;
            myGamePiece.width = 70;
            myGamePiece.height = 70;
            myGamePiece.image.src = "img/poop_md.png";
            accelerate(0.05);
        })
    },
    clear : function() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    stop: function(){
        clearInterval(this.interval);
    }
}

//--------------------------------------------------functions-------------------------------------------------
function startGame() {
    myGamePiece = new component(60, 60, "img/poop_md.png", 700, 245, "image");
    myScore = new component("30px", "Consolas", "purple", 1200, 50, "text");
    myLand = new component(400, 150, "img/land2.png", 0, 650, "land");
    myBackground = new component(1400, 660, "img/background2.png", 0, 0, "background");
    gameover = new component(140, 140, "img/gameover.png", 600, 300, "image");
    myGameArea.start();
}

function component(width, height, color, x, y, type) {
    this.width = width;
    this.height = height;

    this.x = x;
    this.y = y;

    this.type = type;
    if (type == "image" || type == "background" || type == "land") { //set image
        this.image = new Image();
        this.image.src = color;
    }

    this.speedX = 0;//horizontal speed
    this.speedY = 0;//vertical speed

    this.gravity = 0.05;   //gravity
    this.gravitySpeed = 0;

    this.bounce = 0.04;

    this.angle = 0; //angle


    //set new position
    this.newPos = function(){
        if(this.type == "image"){
            this.gravitySpeed += this.gravity;
            this.x += this.speedX;
            this.y += this.speedY + this.gravitySpeed;
            this.hitTop();
            this.hitBottom();
        }else if ((this.type == "background") || (this.type == "land")){
            this.x += this.speedX;
            this.y += this.speedY;
            if(this.x == -(this.width)){
                this.x = 0;
            }
        }else{
            this.x += this.speedX;
            this.y += this.speedY;
        }
    }



    //draw image and fill text
    this.update = function(){
        ctx = myGameArea.context;
        if(type == 'text'){
            ctx.font = this.width + " " + this.height;
            ctx.fillStyle = color;
            ctx.fillText(this.text, this.x, this.y);
        }else if (type == 'image'){
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        }else if(type == 'background'){
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width*2, this.y, this.width, this.height);
        }else if (type == 'land'){
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width*2, this.y, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width*3, this.y, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width*4, this.y, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width*5, this.y, this.width, this.height);
        }else{
            ctx.fillStyle = color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }


    this.crashWith = function(otherobj){
        var myleft = this.x;
        var myright = this.x + (this.width);
        var mytop = this.y;
        var mybottom = this.y + (this.height);
        var otherleft = otherobj.x;
        var otherright = otherobj.x + (otherobj.width);
        var othertop = otherobj.y;
        var otherbottom = otherobj.y + (otherobj.height);
        var crash = true;
         if ((mybottom < othertop) ||
               (mytop > otherbottom) ||
               (myright < otherleft) ||
               (myleft > otherright)) {
           crash = false;
        }
        return crash;
    }

    this.hitTop = function(){
        var rocktop = 0;
        if (this.y < rocktop) {
            this.y = rocktop;
        }
    }

    this.hitBottom = function(){
        var rockbottom = myGameArea.canvas.height - this.height - 140;
        if (this.y > rockbottom) {
            this.y = rockbottom;
            this.gravitySpeed = -(this.gravitySpeed * this.bounce);
        }
    }

}

function updateGameArea() {
    var x, y;
    for(i = 0; i < myObstacles.length; i += 1){
        if(myGamePiece.crashWith(myObstacles[i])){
            gameover.update();
            myGameArea.stop();
            return;
        }
    }
    myGameArea.clear();
    //moving background
    myBackground.speedX = -1;
    myBackground.newPos();
    myBackground.update();

    //moving my land
    myLand.speedX = -1;
    myLand.newPos();
    myLand.update();

    myGameArea.frameNo += 1;

    //adding obstacles
    if (myGameArea.frameNo == 2 || everyinterval(300)) {
        x = myGameArea.canvas.width;
        minHeight = 40;
        maxHeight = 300;
        height = Math.floor(Math.random()*(maxHeight-minHeight+1)+minHeight); //random obstacle height
        minGap = 170;
        maxGap = 300;
        gap = Math.floor(Math.random()*(maxGap-minGap+1)+minGap); //random gap in between
        y = myGameArea.canvas.height;
        myObstacles.push(new component(60, height, "img/pp.png", x, 0, "image"));
        myObstacles.push(new component(70, 25, "img/head.png", x-5, height, "image"));
        myObstacles.push(new component(70, 25, "img/head.png", x-5, height + gap, "image"));
        myObstacles.push(new component(60, y - height - gap - 150 -25, "img/pp.png", x, height + gap +25,"image"));
    }
    for (i = 0; i < myObstacles.length; i += 1) {
        myObstacles[i].x += -1;
        myObstacles[i].update();
    }
    myGamePiece.speedX = 0;
    myGamePiece.speedY = 0;

    myScore.text="SCORE: " + Math.floor(myGameArea.frameNo/20);
    myScore.update();

    //moving poop
    myGamePiece.newPos();
    myGamePiece.update();

    myObstacle.x += -1;
    myObstacle.update();
}

function everyinterval(n){//this function returns true if the current framenumber corresponds with the given interval.
    if((myGameArea.frameNo / n) % 1 == 0){return true;}
    return false;
}

function accelerate(n){
    myGamePiece.gravity = n;
}

function jump(){
    myGamePiece.gravitySpeed = -2;
}
