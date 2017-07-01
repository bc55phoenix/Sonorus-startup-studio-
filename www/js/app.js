// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
var example = angular.module('starter', ['ionic','ngCordova','ngAnimate'])

example.run(function($ionicPlatform) {
  $ionicPlatform.ready(function() {
    if(window.cordova && window.cordova.plugins.Keyboard) {
      // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
      // for form inputs)
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);

      // Don't remove this line unless you know what you are doing. It stops the viewport
      // from snapping when text inputs are focused. Ionic handles this internally for
      // a much nicer keyboard experience.
      cordova.plugins.Keyboard.disableScroll(true);
    }
    if(window.StatusBar) {
      StatusBar.styleDefault(1);
    }
  });
});

example.config(function($stateProvider, $urlRouterProvider) {

  $stateProvider
    .state('record', {
    url: "/",
    templateUrl: "index.html",
    controller: 'ExampleController',
    cache: false
  })
    .state('db', {
    url: "/db",
    templateUrl: "templates/db.html"
  });


  $urlRouterProvider.otherwise("/");

})

example.controller("ExampleController", function($scope,$ionicLoading,$http,$cordovaVibration){

    // Get a canvas defined with ID "oscilloscope"
    var canvas = document.getElementById("canvas");
    var img = document.getElementById("img");
    var happy = document.getElementById("happy");
    var normal = document.getElementById("normal");
    var angry = document.getElementById("angry");
    var startElem = document.getElementById("startCapture");
    var stopElem = document.getElementById("stopCapture");
    var dbElem = document.getElementById("dbElem");
    var sec = "2s";

    canvas.width = window.innerWidth;
    canvas.height = 133;
    // canvas.backgroundColor: rgba(192,192,192,0.3);
    var canvasCtx = canvas.getContext("2d");
    var background = new Image();
    background.src = "./img/Public-speaking.jpg";

    var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
    var GOOD_ENOUGH_CORRELATION = 0.9; // this is the "bar" for how close a correlation needs to be

    var buflen = 1024;
    var audioContext;
    var buf = new Float32Array( buflen );
    var analyser = null;
    var bufferLength;
    var array = [];
    var arrayJSON;
    var images = [];
    var rafID = null;
    // images[0] = "img/n1.png";
    // images[1] = "img/b1.png";
    // images[2] = "img/g1.png";
    // images[3] = "img/b6.png";
    // var src = "";
    var volume;


    //********************** NOT USED FOR NOW ********************************//

    function autoCorrelate( buf, sampleRate ) {
          var SIZE = buf.length;
          var MAX_SAMPLES = Math.floor(SIZE/2);
          var best_offset = -1;
          var best_correlation = 0;
          var rms = 0;
          var foundGoodCorrelation = false;
          var correlations = new Array(MAX_SAMPLES);

          for (var i=0;i<SIZE;i++) {
            var val = buf[i];
            rms += val*val;
          }
          rms = Math.sqrt(rms/SIZE);
          if (rms<0.01) // not enough signal
            return -1;

          var lastCorrelation=1;
          for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
            var correlation = 0;

            for (var i=0; i<MAX_SAMPLES; i++) {
              correlation += Math.abs((buf[i])-(buf[i+offset]));
            }
            correlation = 1 - (correlation/MAX_SAMPLES);
            correlations[offset] = correlation; // store it, for the tweaking we need to do below.
            if ((correlation>GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
              foundGoodCorrelation = true;
              if (correlation > best_correlation) {
                best_correlation = correlation;
                best_offset = offset;
              }
            } else if (foundGoodCorrelation) {
              // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
              // Now we need to tweak the offset - by interpolating between the values to the left and right of the
              // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
              // we need to do a curve fit on correlations[] around best_offset in order to better determine precise
              // (anti-aliased) offset.

              // we know best_offset >=1, 
              // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and 
              // we can't drop into this clause until the following pass (else if).
              var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];  
              return sampleRate/(best_offset+(8*shift));
            }
            lastCorrelation = correlation;
          }
          if (best_correlation > 0.01) {
            // console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
            return sampleRate/best_offset;
          }
          return -1;
        //  var best_frequency = sampleRate/best_offset;
    }

    var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    function noteFromPitch( frequency ) {
      var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
      return Math.round( noteNum ) + 69;
    }

    function frequencyFromNoteNumber( note ) {
      return 440 * Math.pow(2,(note-69)/12);
    }

    function centsOffFromPitch( frequency, note ) {
      return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
    }

    function updatePitch( time ) {
        var cycles = new Array;
        analyser.getByteTimeDomainData( array );
        var ac = autoCorrelate( array, audioContext.sampleRate );
        // acDetect = ac;
        // TODO: Paint confidence meter on canvasElem here.

        if (canvas) {  // This draws the current waveform, useful for debugging
          // waveCanvas.clearRect(0,0,512,256);
          // waveCanvas.strokeStyle = "red";
          var h = canvas.height;
          var w = canvas.width;
          canvasCtx.beginPath();
          canvasCtx.moveTo(h/2,array[0]);
          for (var i=1;i<w;i++) {
            canvasCtx.lineTo(h+(array[i]*h),i);
          }
          canvasCtx.stroke();
           canvasCtx.strokeStyle = "black";
        }

        if (ac == -1) {
          // detectorElem.className = "vague";
          // pitchElem.innerText = "--";
          // noteElem.innerText = "-";
          // detuneElem.className = "";
          // detuneAmount.innerText = "--";
          document.getElementById("audInpError").innerHTML = ("--");
        } else {
          // detectorElem.className = "confident";
          pitch = ac;
          document.getElementById("audInpError").innerHTML = Math.round( pitch ) ;
          var note =  noteFromPitch( pitch );
          // acDetect = note;
          document.getElementById("webAud").innerHTML = noteStrings[note%12];
          var detune = centsOffFromPitch( pitch, note );
          if (detune == 0 ) {
            // detuneElem.className = "";
            // detuneAmount.innerHTML = "--";
            document.getElementById("audInpError").innerHTML = "--"
          } else {
            if (detune < 0)
              document.getElementById("audInpError").innerHTML = "flat";
            else
              document.getElementById("audInpError").innerHTML = Math.abs( detune );
          }
        }
    }

    //********************** NOT USED FOR NOW ********************************//



    function displayImage() {
        var volume = speechcapture.getCurrentVolume();
        // volume = parseInt(volume.substr(volume.indexOf(' ')+1)); 

        document.getElementById('level').innerHTML = 'VOL '  + volume;

        if(volume >= -43){ //good case
            // src = images[2];
            happy.checked = true;
        } 
        else if (volume >= -78 && volume < -43){ // bad case
            // src = images[1];
            angry.checked = true;
        }
        else{
            // src = images[0]; //neutral
            normal.checked = true;
        }

        // img.src = src;
        volume = 0;
    }

    function startTimer() {
        setInterval(displayImage, 3500);
    }

    function startTimer2(audioBuffer) {
        setInterval(process(audioBuffer), 100000);
    }





var draw = function () {

    var i, n = array.length;
    var dur = (n / 44100 * 1000)>>0;
    // canvas.title = 'Duration: ' +  dur / 1000.0 + 's';

    var width=canvas.width,height=canvas.height;
    canvasCtx.strokeStyle = "#E06666";
    canvasCtx.fillStyle = "rgba(255, 255, 255, 0)";
    canvasCtx.fillRect(0,0,width,height);
    canvasCtx.beginPath();
    canvasCtx.moveTo(0,height/2);
    for (i=0; i<n; i++)
    {
        x = ( (i*width) / n);
        y = ((array[i]*height/2)+height/2);
        canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
    canvasCtx.closePath();

}


/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/

/*
 This demo shows how to detect speech events from microphone data using the speechcapture library,
 and encode each event into WAV format audio buffers. No Web Audio API support is needed for this to work unless you
 specify the audioResultType as speechcapture.AUDIO_RESULT_TYPE.WEBAUDIO_AUDIOBUFFER.
 */

var timerInterVal = null,
    totalNoOfSpeechEvents = 0,
    totalNoOfSpeechCaptured = 0,
    totalNoOfSpeechErrors = 0,
    captureCfg = {},

    availableCordova = false,
    availableAudioInputPlugin = false,
    availableSpeechCapture = false,

    id = 0;

/**
 * Called when speech has been captured
 * @param audioBuffer
 * @param type speechcapture.AUDIO_RESULT_TYPE
 */
function onSpeechCaptured(audioBuffer, type) {
    totalNoOfSpeechCaptured++;
    handleAudioBuffer(audioBuffer, type);
    array = audioBuffer;
    draw();
    startTimer2(audioBuffer);
}

/***********************************************************/

/***********************************************************/
//                  AUDIO BUFFER
/***********************************************************/

/***********************************************************/

/***********************************************************/

/***********************************************************/

/***********************************************************/

/**
 * Called when a speechcapture error has occurred
 * @param error
 */
function onSpeechError(error) {
    totalNoOfSpeechErrors++;
    alert("onSpeechError event recieved: " + JSON.stringify(error));
    stopSpeechCapture();
}


/**
 * Called when the speechcapture status changes
 * @param code
 */
function onSpeechStatus(code) {
    totalNoOfSpeechEvents++;

    switch (code) {
        case speechcapture.STATUS.CAPTURE_STARTED:
            consoleMessage("Capture Started!");
            turnOffSpeakingRightNowIndicator();
            break;
        case speechcapture.STATUS.CAPTURE_STOPPED:
            consoleMessage("Capture Stopped!");
            resetSpeakingRightNowIndicator();
            break;
        case speechcapture.STATUS.SPEECH_STARTED:
            consoleMessage("Speech Started!");
            turnOnSpeakingRightNowIndicator();
            break;
        case speechcapture.STATUS.ENCODING_ERROR:
            totalNoOfSpeechErrors++;
            consoleMessage("Encoding Error!");
            break;
        case speechcapture.STATUS.CAPTURE_ERROR:
            totalNoOfSpeechErrors++;
            consoleMessage("Capture Error!");
            break;
        case speechcapture.STATUS.SPEECH_ERROR:
            totalNoOfSpeechErrors++;
            consoleMessage("Speech Error!");
            break;
        case speechcapture.STATUS.SPEECH_MAX_LENGTH:
            consoleMessage("Max Length Occurred!");
            break;
        case speechcapture.STATUS.SPEECH_MIN_LENGTH:
            consoleMessage("Min Length Occurred!");
            break;
        default:
        case speechcapture.STATUS.SPEECH_STOPPED:
            consoleMessage("Speech Stopped!");
            turnOffSpeakingRightNowIndicator();
            break;
    }
}


/**
 *
 */
    $scope.startSpeechCapture = function () {
    try {
        if (!speechcapture.isCapturing()) {

        startElem.style.display = "none";
        startElem.style.transition = "opacity " + sec + " ease-in";
        stopElem.style.display = "inline";
        stopElem.style.transition = "opacity " + sec + " ease-in";
        dbElem.style.opacity = "0";

        dbElem.style.transition = "opacity 1s " + " ease-in";

            totalNoOfSpeechCaptured = 0;
            totalNoOfSpeechErrors = 0;
            totalNoOfSpeechEvents = 0;

            var audioSourceElement = document.getElementById("audioSource"),
                audioSourceType = audioSourceElement.options[audioSourceElement.selectedIndex].value,

                // audioResultTypeElement = document.getElementById("audioResultType"),
                // audioResultType = parseInt(audioResultTypeElement.options[audioResultTypeElement.selectedIndex].value),
                audioResultType = 3;

                speechThreshold = parseInt(document.getElementById('speechThreshold').value),
                speechMin = parseInt(document.getElementById('minSpeechLength').value),
                speechMax = parseInt(document.getElementById('maxSpeechLength').value),
                speechAllowedDelay = parseInt(document.getElementById('speechAllowedDelay').value),
                analysisChunkLength = parseInt(document.getElementById('analysisChunkLength').value),
                sampleRate = parseInt(document.getElementById('sampleRate').value),
                bufferSize = parseInt(document.getElementById('bufferSize').value),

                compressPausesElement = document.getElementById("compressPauses"),
                // compressPauses = (parseInt(compressPausesElement.options[compressPausesElement.selectedIndex].value) === 1),
                compressPauses = 0;

                preferGUMElement = document.getElementById("preferGUM"),
                preferGUM = (parseInt(preferGUMElement.options[preferGUMElement.selectedIndex].value) === 1),

                detectOnlyElement = document.getElementById("detectOnly"),
                detectOnly = (parseInt(detectOnlyElement.options[detectOnlyElement.selectedIndex].value) === 1);

            captureCfg = {
                audioSourceType: parseInt(audioSourceType),
                audioResultType: audioResultType,
                speechDetectionThreshold: speechThreshold,
                speechDetectionMinimum: speechMin,
                speechDetectionMaximum: speechMax,
                speechDetectionAllowedDelay: speechAllowedDelay,
                audioContext: audioContext,
                analysisChunkLength: analysisChunkLength,
                sampleRate: sampleRate,
                bufferSize: bufferSize,
                compressPauses: compressPauses,
                preferGUM: preferGUM,
                detectOnly: detectOnly,
                audioInputPluginActive: true,
                debugAlerts: true, // Just for debug
                debugConsole: true // Just for debug
            };

            speechcapture.start(captureCfg, onSpeechCaptured, onSpeechError, onSpeechStatus);

            // Throw previously created audio
            document.getElementById("recording-list").innerHTML = "";
            timerInterVal = setInterval(function () {
                if (speechcapture.isCapturing()) {
                    displayImage();
                }
            }, 3500);

            disableStartButton();
        }

    }
    catch (e) {
        alert("startSpeechCapture exception: " + e);
    }
};


/**
 *
 */
  $scope.stopSpeechCapture = function () {
    try {
        if (speechcapture.isCapturing()) {
            if (timerInterVal) {
                clearInterval(timerInterVal);
            }

            speechcapture.stop();
        }

        resetSpeakingRightNowIndicator();
        disableStopButton();
        normal.checked = true;
        stopElem.style.transition = "opacity " + sec + " ease-in";
        stopElem.style.display = "none";
        startElem.style.display = "inline";
        startElem.style.transition = "opacity " + sec + " ease-in";
        dbElem.style.opacity = "1";
        dbElem.style.transition = "opacity " + sec + " ease-in";
        id = 0;
    }
    catch (e) {
        alert("stopSpeechCapture exception: " + e);
    }
};


/**
 *
 * @param audioBuffer
 * @param type speechcapture.AUDIO_RESULT_TYPE
 */
var handleAudioBuffer = function (audioBuffer, type) {
    try {
        switch (type) {
            case speechcapture.AUDIO_RESULT_TYPE.WEBAUDIO_AUDIOBUFFER:
                appendWebAudioBuffer(audioBuffer);
                break;

            case speechcapture.AUDIO_RESULT_TYPE.RAW_DATA:
                appendRAWAudioBuffer(audioBuffer);
                break;

            case speechcapture.AUDIO_RESULT_TYPE.WAV_BLOB:
                appendWAVAudioBuffer(audioBuffer);
                break;

            case speechcapture.AUDIO_RESULT_TYPE.DETECTION_ONLY:
                appendDetectionOnlyCapture();
                break;

            default:
                alert("handleAudioBuffer - Unknown type of Audio result: " + captureCfg.audioSourceType);
                break;
        }
    }
    catch (e) {
        alert("handleAudioBuffer ex: " + e);
    }
};


/**
 *
 * @param audioBuffer
 */
var appendWAVAudioBuffer = function (audioBuffer) {
    try {
        var reader = new FileReader();
        reader.onload = function (evt) {
            var audio = document.createElement("AUDIO");
            audio.controls = true;
            audio.src = evt.target.result;
            // consoleMessage(evt.target.result);
            audio.type = "audio/wav";
            document.getElementById("recording-list").appendChild(audio);
        };
        reader.readAsDataURL(audioBuffer);
        consoleMessage("Audio added...");
    }
    catch (e) {
        alert("appendWAVAudioBuffer ex: " + e);
    }
};



/**
 *
 * @param audioBuffer
 */
var appendRAWAudioBuffer = function (audioBuffer) {
    try {
      // array = audioBuffer;
    
    // draw();
        var div = document.createElement("div"),
            length = audioBuffer.length;
        div.innerHTML = 'Raw Audio (' + length + " bytes)";
        var myAud = audioBuffer;
        consoleMessage(audioBuffer);
        id++;
        var rawAudJson = audioBuffer.toString();

        sendRequest(id, audioBuffer);

        div.className = 'audio-element';

        // consoleMessage(rawAudJson);
        document.getElementById("recording-list").appendChild(div);
        consoleMessage("Raw Audio Data added...");
    }
    catch (e) {
        alert("appendRAWAudioBuffer ex: " + e);
    }
};


/**
 *
 * @param audioBuffer
 */
var appendWebAudioBuffer = function (audioBuffer) {
    try {
        var btn = document.createElement("div"),
            duration = audioBuffer.duration;
        btn.innerHTML = 'Play (' + parseFloat(duration).toFixed(1) + "s)";
        btn.className = 'audio-element';

        btn.href ="#";

        // Play the audio when tapped/clicked
        btn.onclick = function(){
            try {
                var source = speechcapture.getAudioContext().createBufferSource();
                source.buffer = audioBuffer;
                source.connect(speechcapture.getAudioContext().destination);
                source.start();
            }
            catch(e) {
                alert("appendWebAudioBuffer exception: " + e);
            }
        };

        document.getElementById("recording-list").appendChild(btn);
        consoleMessage("Audio added...");
    }
    catch (e) {
        alert("appendWAVAudioBuffer ex: " + e);
    }
};


/**
 *
 */
var appendDetectionOnlyCapture = function () {
    try {
        var div = document.createElement("div");
        div.innerHTML = 'Detection Event';
        div.className = 'audio-element';

        document.getElementById("recording-list").appendChild(div);
        consoleMessage("Detection Event added...");
    }
    catch (e) {
        alert("appendDetectionOnlyCapture ex: " + e);
    }
};

/**
 * When cordova fires the deviceready event, we initialize everything needed for audio input.
 */
var onDeviceReady = function () {

    availableSpeechCapture = true;
    availableCordova = true;
    availableAudioInputPlugin = true;

    if (!window.speechcapture) {
        availableSpeechCapture = false;
    }

    if (!window.cordova) {
        availableCordova = false;
    }

    if (!window.audioinput) {
        availableAudioInputPlugin = false;
    }


    if(availableSpeechCapture) {
        initUIEvents();
        consoleMessage("Use 'Start Capture' to begin...");
    }
    else {
        consoleMessage("Missing: speechcapture library!");
        disableAllButtons();
    }
};


// Make it possible to run the demo on desktop
if (!window.cordova) {
    // Make it possible to run the demo on desktop
    console.log("Running on desktop!");
    onDeviceReady();
}
else {
    // For Cordova apps
    document.addEventListener('deviceready', onDeviceReady, false);
}

/**
 *
 */
var turnOnSpeakingRightNowIndicator = function () {
    var el = document.getElementById('speakingRightNow');
    if (el) {
        el.innerHTML = 'SPEAKING';
    }
};

/**
 *
 */
var turnOffSpeakingRightNowIndicator = function () {
    var el = document.getElementById('speakingRightNow');
    if (el) {
        el.innerHTML = 'SILENT';
    }
};

/**
 *
 */
var resetSpeakingRightNowIndicator = function () {
    var el = document.getElementById('speakingRightNow');
    if (el) {
        el.innerHTML = '';
    }
};

resetSpeakingRightNowIndicator();

/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/
/***********************************************************************/

var fillerStr = "";
var fillerArr = [];

function showFiller(trans){
    fillerStr = trans;
    // fillerStr = fillerStr.replace(/,/g , " ");
    document.getElementById("webAud").innerHTML = fillerStr;

      flashClr();

       // $cordovaVibration.vibrate(100);
       fillerStr = "";
}

 function flashClr() {
     var rect = document.getElementById("rect");
        setTimeout(function () {
            rect.style.opacity = 0;
         }, 2000);
      rect.style.opacity = 1;
    }

// JSON.stringify(array)
 var jsonArr = [];

 // $scope.sendRequest = function(myId, rawAud){
  var sendRequest = function(myId, rawAud){
      var id = "";
      var trans = "";
      var id_ = "";
      var trans_ = "";

          var req = {
             method: 'POST',
             url: 'http://10.128.28.77:5000/trans',
             headers: {
               'Content-Type': 'application/json'
             },
             data: { msg: 'hello flask, this is ionic.',
                id: myId,
                audio: rawAud 
            }
                
          }
          consoleMessage('###sendReq');


          $http(req).then(function successCallback(response) {
                  // alert("sucessful callback" + response.data);
                  consoleMessage("sucessful callback " + response.data);
                  trans = response.data;
                  consoleMessage("Transcript: " + trans);
                  if(trans){
                    showFiller(trans);
                  }
            }, function errorCallback(response) {
                // alert("connection exception: " + response.data);
                consoleMessage("connection exception: " + response.data);
          });
}

});
