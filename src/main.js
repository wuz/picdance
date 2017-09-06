function Sounds() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return {
      note: () => {},
    };
  }
  var audioInput = null,
    wetGain = null,
    dryGain = null,
    outputMix = null,
    currentEffectNode = null,
    reverbBuffer = null,
    dtime = null,
    dregen = null,
    lfo = null,
    cspeed = null,
    cdelay = null,
    cdepth = null,
    scspeed = null,
    scldelay = null,
    scrdelay = null,
    scldepth = null,
    scrdepth = null,
    fldelay = null,
    flspeed = null,
    fldepth = null,
    flfb = null,
    sflldelay = null,
    sflrdelay = null,
    sflspeed = null,
    sflldepth = null,
    sflrdepth = null,
    sfllfb = null,
    sflrfb = null,
    rmod = null,
    mddelay = null,
    mddepth = null,
    mdspeed = null,
    lplfo = null,
    lplfodepth = null,
    lplfofilter = null,
    awFollower = null,
    awDepth = null,
    awFilter = null,
    ngFollower = null,
    ngGate = null,
    bitCrusher = null,
    btcrBits = 16, // between 1 and 16
    btcrNormFreq = 1; // between 0.0 and 1.0

  function EnvelopeNode(att, sus, dec, rel) {
    const gain = this.createGain();
    gain.gain.value = 0;
    gain.trigger = (length) => {
      let now = this.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1.0, now + att);
      now += att;
      gain.gain.linearRampToValueAtTime(sus, now + dec);
      if (length) {
        setTimeout(() => gain.release(), length * 1000);
      }
    };
    gain.release = () => {
      const now = this.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + rel);
    };
    return gain;
  }

  function crossfade(value) {
    // equal-power crossfade
    var gain1 = Math.cos(value * 0.5 * Math.PI);
    var gain2 = Math.cos((1.0 - value) * 0.5 * Math.PI);

    dryGain.gain.value = gain1;
    wetGain.gain.value = gain2;
  }

  function createTelephonizer() {
    // I double up the filters to get a 4th-order filter = faster fall-off
    var lpf1 = context.createBiquadFilter();
    lpf1.type = "lowpass";
    lpf1.frequency.value = 2000.0;
    var lpf2 = context.createBiquadFilter();
    lpf2.type = "lowpass";
    lpf2.frequency.value = 2000.0;
    var hpf1 = context.createBiquadFilter();
    hpf1.type = "highpass";
    hpf1.frequency.value = 500.0;
    var hpf2 = context.createBiquadFilter();
    hpf2.type = "highpass";
    hpf2.frequency.value = 500.0;
    lpf1.connect(lpf2);
    lpf2.connect(hpf1);
    hpf1.connect(hpf2);
    hpf2.connect(wetGain);
    currentEffectNode = lpf1;
    return (lpf1);
  }

  function createDelay() {
    var delayNode = context.createDelay();

    delayNode.delayTime.value = parseFloat(document.getElementById("dtime").value);
    dtime = delayNode;

    var gainNode = context.createGain();
    gainNode.gain.value = parseFloat(document.getElementById("dregen").value);
    dregen = gainNode;

    gainNode.connect(delayNode);
    delayNode.connect(gainNode);
    delayNode.connect(wetGain);

    return delayNode;
  }

  function createReverb() {
    var convolver = context.createConvolver();
    convolver.buffer = reverbBuffer; // impulseResponse( 2.5, 2.0 );  // reverbBuffer;
    convolver.connect(wetGain);
    return convolver;
  }

  var waveshaper = null;

  function createDistortion() {
    if (!waveshaper)
      waveshaper = new WaveShaper(context);

    waveshaper.output.connect(wetGain);
    waveshaper.setDrive(5.0);
    return waveshaper.input;
  }

  function createGainLFO() {
    var osc = context.createOscillator();
    var gain = context.createGain();
    var depth = context.createGain();

    osc.type = document.getElementById("lfotype").value;
    osc.frequency.value = parseFloat(document.getElementById("lfo").value);

    gain.gain.value = 1.0; // to offset
    depth.gain.value = 1.0;
    osc.connect(depth); // scales the range of the lfo

    depth.connect(gain.gain);
    gain.connect(wetGain);
    lfo = osc;
    lfotype = osc;
    lfodepth = depth;

    osc.start(0);
    return gain;
  }

  function createFilterLFO() {
    var osc = context.createOscillator();
    var gainMult = context.createGain();
    var gain = context.createGain();
    var filter = context.createBiquadFilter();

    filter.type = "lowpass";
    filter.Q.value = parseFloat(document.getElementById("lplfoq").value);
    lplfofilter = filter;

    osc.type = 'sine';
    osc.frequency.value = parseFloat(document.getElementById("lplfo").value);
    osc.connect(gain);

    filter.frequency.value = 2500; // center frequency - this is kinda arbitrary.
    gain.gain.value = 2500 * parseFloat(document.getElementById("lplfodepth").value);
    // this should make the -1 - +1 range of the osc translate to 0 - 5000Hz, if
    // depth == 1.

    gain.connect(filter.frequency);
    filter.connect(wetGain);
    lplfo = osc;
    lplfodepth = gain;

    osc.start(0);
    return filter;
  }

  function createRingmod() {
    var gain = context.createGain();
    var ring = context.createGain();
    var osc = context.createOscillator();

    osc.type = 'sine';
    rmod = osc;
    osc.frequency.value = Math.pow(2, parseFloat(document.getElementById("rmfreq").value));
    osc.connect(ring.gain);

    ring.gain.value = 0.0;
    gain.connect(ring);
    ring.connect(wetGain);
    osc.start(0);
    return gain;
  }

  var awg = null;

  function createChorus({ delay, depth, speed }) {
    var delayNode = context.createDelay();
    delayNode.delayTime.value = parseFloat(delay);
    cdelay = delayNode;

    var inputNode = context.createGain();

    var osc = context.createOscillator();
    var gain = context.createGain();

    gain.gain.value = parseFloat(depth); // depth of change to the delay:
    cdepth = gain;

    osc.type = 'sine';
    osc.frequency.value = parseFloat(speed);
    cspeed = osc;

    osc.connect(gain);
    gain.connect(delayNode.delayTime);

    inputNode.connect(wetGain);
    inputNode.connect(delayNode);
    delayNode.connect(wetGain);

    osc.start(0);

    return inputNode;
  }

  function createVibrato() {
    var delayNode = context.createDelay();
    delayNode.delayTime.value = parseFloat(document.getElementById("vdelay").value);
    cdelay = delayNode;

    var inputNode = context.createGain();

    var osc = context.createOscillator();
    var gain = context.createGain();

    gain.gain.value = parseFloat(document.getElementById("vdepth").value); // depth of change to the delay:
    cdepth = gain;

    osc.type = 'sine';
    osc.frequency.value = parseFloat(document.getElementById("vspeed").value);
    cspeed = osc;

    osc.connect(gain);
    gain.connect(delayNode.delayTime);
    inputNode.connect(delayNode);
    delayNode.connect(wetGain);
    osc.start(0);

    return inputNode;
  }

  function createFlange() {
    var delayNode = context.createDelay();
    delayNode.delayTime.value = parseFloat(document.getElementById("fldelay").value);
    fldelay = delayNode;

    var inputNode = context.createGain();
    var feedback = context.createGain();
    var osc = context.createOscillator();
    var gain = context.createGain();
    gain.gain.value = parseFloat(document.getElementById("fldepth").value);
    fldepth = gain;

    feedback.gain.value = parseFloat(document.getElementById("flfb").value);
    flfb = feedback;

    osc.type = 'sine';
    osc.frequency.value = parseFloat(document.getElementById("flspeed").value);
    flspeed = osc;

    osc.connect(gain);
    gain.connect(delayNode.delayTime);

    inputNode.connect(wetGain);
    inputNode.connect(delayNode);
    delayNode.connect(wetGain);
    delayNode.connect(feedback);
    feedback.connect(inputNode);

    osc.start(0);

    return inputNode;
  }

  function createStereoChorus() {
    var splitter = context.createChannelSplitter(2);
    var merger = context.createChannelMerger(2);
    var inputNode = context.createGain();

    inputNode.connect(splitter);
    inputNode.connect(wetGain);

    var delayLNode = context.createDelay();
    var delayRNode = context.createDelay();
    delayLNode.delayTime.value = parseFloat(document.getElementById("scdelay").value);
    delayRNode.delayTime.value = parseFloat(document.getElementById("scdelay").value);
    scldelay = delayLNode;
    scrdelay = delayRNode;
    splitter.connect(delayLNode, 0);
    splitter.connect(delayRNode, 1);

    var osc = context.createOscillator();
    scldepth = context.createGain();
    scrdepth = context.createGain();

    scldepth.gain.value = parseFloat(document.getElementById("scdepth").value); // depth of change to the delay:
    scrdepth.gain.value = -parseFloat(document.getElementById("scdepth").value); // depth of change to the delay:

    osc.type = 'triangle';
    osc.frequency.value = parseFloat(document.getElementById("scspeed").value);
    scspeed = osc;

    osc.connect(scldepth);
    osc.connect(scrdepth);

    scldepth.connect(delayLNode.delayTime);
    scrdepth.connect(delayRNode.delayTime);

    delayLNode.connect(merger, 0, 0);
    delayRNode.connect(merger, 0, 1);
    merger.connect(wetGain);

    osc.start(0);

    return inputNode;
  }

  /*
      Add modulation to delayed signal akin to ElectroHarmonix MemoryMan Guitar Pedal.
      Simple combination of effects with great output hear on lots of records.

      FX Chain ASCII PIC:
                  v- FEEDBACK -|
      INPUT -> DELAY -> CHORUS -> OUTPUT
      */
  function createModDelay() {
    // Create input node for incoming audio
    var inputNode = context.createGain();

    // SET UP DELAY NODE
    var delayNode = context.createDelay();
    delayNode.delayTime.value = parseFloat(document.getElementById("mdtime").value);
    mdtime = delayNode;

    var feedbackGainNode = context.createGain();
    feedbackGainNode.gain.value = parseFloat(document.getElementById("mdfeedback").value);
    mdfeedback = feedbackGainNode;

    // SET UP CHORUS NODE
    var chorus = context.createDelay();
    chorus.delayTime.value = parseFloat(document.getElementById("mddelay").value);
    mddelay = chorus;

    var osc = context.createOscillator();
    var chorusRateGainNode = context.createGain();
    chorusRateGainNode.gain.value = parseFloat(document.getElementById("mddepth").value); // depth of change to the delay:
    mddepth = chorusRateGainNode;

    osc.type = 'sine';
    osc.frequency.value = parseFloat(document.getElementById("mdspeed").value);
    mdspeed = osc;

    osc.connect(chorusRateGainNode);
    chorusRateGainNode.connect(chorus.delayTime);

    // Connect the FX chain together
    // create circular chain for delay to "feedback" to itself
    inputNode.connect(delayNode);
    delayNode.connect(chorus);
    delayNode.connect(feedbackGainNode);
    chorus.connect(feedbackGainNode);
    feedbackGainNode.connect(delayNode);
    feedbackGainNode.connect(wetGain);

    osc.start(0);

    return inputNode;
  }

  function createStereoFlange() {
    var splitter = context.createChannelSplitter(2);
    var merger = context.createChannelMerger(2);
    var inputNode = context.createGain();
    sfllfb = context.createGain();
    sflrfb = context.createGain();
    sflspeed = context.createOscillator();
    sflldepth = context.createGain();
    sflrdepth = context.createGain();
    sflldelay = context.createDelay();
    sflrdelay = context.createDelay();

    sfllfb.gain.value = sflrfb.gain.value = parseFloat(document.getElementById("sflfb").value);

    inputNode.connect(splitter);
    inputNode.connect(wetGain);

    sflldelay.delayTime.value = parseFloat(document.getElementById("sfldelay").value);
    sflrdelay.delayTime.value = parseFloat(document.getElementById("sfldelay").value);

    splitter.connect(sflldelay, 0);
    splitter.connect(sflrdelay, 1);
    sflldelay.connect(sfllfb);
    sflrdelay.connect(sflrfb);
    sfllfb.connect(sflrdelay);
    sflrfb.connect(sflldelay);

    sflldepth.gain.value = parseFloat(document.getElementById("sfldepth").value); // depth of change to the delay:
    sflrdepth.gain.value = -parseFloat(document.getElementById("sfldepth").value); // depth of change to the delay:

    sflspeed.type = 'triangle';
    sflspeed.frequency.value = parseFloat(document.getElementById("sflspeed").value);

    sflspeed.connect(sflldepth);
    sflspeed.connect(sflrdepth);

    sflldepth.connect(sflldelay.delayTime);
    sflrdepth.connect(sflrdelay.delayTime);

    sflldelay.connect(merger, 0, 0);
    sflrdelay.connect(merger, 0, 1);
    merger.connect(wetGain);

    sflspeed.start(0);

    return inputNode;
  }

  function createPitchShifter() {
    effect = new Jungle(context);
    effect.output.connect(wetGain);
    return effect.input;
  }

  function createEnvelopeFollower() {
    var waveshaper = context.createWaveShaper();
    var lpf1 = context.createBiquadFilter();
    lpf1.type = "lowpass";
    lpf1.frequency.value = 10.0;

    var curve = new Float32Array(65536);
    for (var i = -32768; i < 32768; i++)
      curve[i + 32768] = ((i > 0) ? i : -i) / 32768;
    waveshaper.curve = curve;
    waveshaper.connect(lpf1);
    lpf1.connect(wetGain);
    return waveshaper;
  }

  function createAutowah() {
    var inputNode = context.createGain();
    var waveshaper = context.createWaveShaper();
    awFollower = context.createBiquadFilter();
    awFollower.type = "lowpass";
    awFollower.frequency.value = 10.0;

    var curve = new Float32Array(65536);
    for (var i = -32768; i < 32768; i++)
      curve[i + 32768] = ((i > 0) ? i : -i) / 32768;
    waveshaper.curve = curve;
    waveshaper.connect(awFollower);

    awDepth = context.createGain();
    awDepth.gain.value = 11585;
    awFollower.connect(awDepth);

    awFilter = context.createBiquadFilter();
    awFilter.type = "lowpass";
    awFilter.Q.value = 15;
    awFilter.frequency.value = 50;
    awDepth.connect(awFilter.frequency);
    awFilter.connect(wetGain);

    inputNode.connect(waveshaper);
    inputNode.connect(awFilter);
    return inputNode;
  }

  function createNoiseGate() {
    var inputNode = context.createGain();
    var rectifier = context.createWaveShaper();
    ngFollower = context.createBiquadFilter();
    ngFollower.type = "lowpass";
    ngFollower.frequency.value = 10.0;

    var curve = new Float32Array(65536);
    for (var i = -32768; i < 32768; i++)
      curve[i + 32768] = ((i > 0) ? i : -i) / 32768;
    rectifier.curve = curve;
    rectifier.connect(ngFollower);

    ngGate = context.createWaveShaper();
    ngGate.curve = generateNoiseFloorCurve(parseFloat(document.getElementById("ngFloor").value));

    ngFollower.connect(ngGate);

    var gateGain = context.createGain();
    gateGain.gain.value = 0.0;
    ngGate.connect(gateGain.gain);

    gateGain.connect(wetGain);

    inputNode.connect(rectifier);
    inputNode.connect(gateGain);
    return inputNode;
  }

  function generateNoiseFloorCurve(floor) {
    // "floor" is 0...1

    var curve = new Float32Array(65536);
    var mappedFloor = floor * 32768;

    for (var i = 0; i < 32768; i++) {
      var value = (i < mappedFloor) ? 0 : 1;

      curve[32768 - i] = -value;
      curve[32768 + i] = value;
    }
    curve[0] = curve[1]; // fixing up the end.

    return curve;
  }

  function setBitCrusherDepth(bits) {
    var length = Math.pow(2, bits);
    console.log("setting bitcrusher depth to " + bits + " bits, length = " + length);
    var curve = new Float32Array(length);

    var lengthMinusOne = length - 1;

    for (var i = 0; i < length; i++)
      curve[i] = (2 * i / lengthMinusOne) - 1;

    if (bitCrusher)
      bitCrusher.curve = curve;
  }

  var btcrBufferSize = 4096;

  function createBitCrusher() {
    var bitCrusher = context.createScriptProcessor(btcrBufferSize, 1, 1);
    var phaser = 0;
    var last = 0;

    bitCrusher.onaudioprocess = function(e) {
      var step = Math.pow(1 / 2, btcrBits);
      for (var channel = 0; channel < e.inputBuffer.numberOfChannels; channel++) {
        var input = e.inputBuffer.getChannelData(channel);
        var output = e.outputBuffer.getChannelData(channel);
        for (var i = 0; i < btcrBufferSize; i++) {
          phaser += btcrNormFreq;
          if (phaser >= 1.0) {
            phaser -= 1.0;
            last = step * Math.floor(input[i] / step + 0.5);
          }
          output[i] = last;
        }
      }
    };
    bitCrusher.connect(wetGain);
    return bitCrusher;
  }

  btcrBits = 16,
    btcrNormFreq

  function impulseResponse(duration, decay, reverse) {
    var sampleRate = context.sampleRate;
    var length = sampleRate * duration;
    var impulse = context.createBuffer(2, length, sampleRate);
    var impulseL = impulse.getChannelData(0);
    var impulseR = impulse.getChannelData(1);

    if (!decay)
      decay = 2.0;
    for (var i = 0; i < length; i++) {
      var n = reverse ? length - i : i;
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
    }
    return impulse;
  }

  AudioContext.prototype.createEnvelope = function createEnvelope(...props) {
    return EnvelopeNode.call(this, ...props);
  };
  const context = new AudioContext();

  // create mix gain nodes
  outputMix = context.createGain();
  dryGain = context.createGain();
  wetGain = context.createGain();
  dryGain.connect(outputMix);
  wetGain.connect(outputMix);
  crossfade(1.0);

  function changeEffect(effect, value) {
    switch (effect) {
      case 0: // Delay
        currentEffectNode = createDelay(value);
        break;
      case 1: // Reverb
        currentEffectNode = createReverb();
        break;
      case 2: // Distortion
        currentEffectNode = createDistortion();
        break;
      case 3: // Telephone
        currentEffectNode = createTelephonizer();
        break;
      case 4: // GainLFO
        currentEffectNode = createGainLFO();
        break;
      case 5: // Chorus
        currentEffectNode = createChorus(value);
        break;
      case 6: // Flange
        currentEffectNode = createFlange();
        break;
      case 7: // Ringmod
        currentEffectNode = createRingmod();
        break;
      case 8: // Stereo Chorus
        currentEffectNode = createStereoChorus();
        break;
      case 9: // Stereo Flange
        currentEffectNode = createStereoFlange();
        break;
      case 10: // Pitch shifting
        currentEffectNode = createPitchShifter();
        break;
      case 11: // Mod Delay
        currentEffectNode = createModDelay();
        break;
      case 12: // Ping-pong delay
        var pingPong = createPingPongDelay(context, (audioInput == realAudioInput), 0.3, 0.4);
        pingPong.output.connect(wetGain);
        currentEffectNode = pingPong.input;
        break;
      case 13: // LPF LFO
        currentEffectNode = createFilterLFO();
        break;
      case 14: // Envelope Follower
        currentEffectNode = createEnvelopeFollower();
        break;
      case 15: // Autowah
        currentEffectNode = createAutowah();
        break;
      case 16: // Noise gate
        currentEffectNode = createNoiseGate();
        break;
      case 17: // Wah Bass
        var pingPong = createPingPongDelay(context, (audioInput == realAudioInput), 0.5, 0.5);
        pingPong.output.connect(wetGain);
        pingPong.input.connect(wetGain);
        var tempWetGain = wetGain;
        wetGain = pingPong.input;
        wetGain = createAutowah();
        currentEffectNode = createPitchShifter();
        wetGain = tempWetGain;
        break;
      case 18: // Distorted Wah Chorus
        var tempWetGain = wetGain;
        wetGain = createStereoChorus();
        wetGain = createDistortion();
        currentEffectNode = createAutowah();
        wetGain = tempWetGain;
        waveshaper.setDrive(20);
        break;
      case 19: // Vibrato
        currentEffectNode = createVibrato();
        break;
      case 20: // BitCrusher
        currentEffectNode = createBitCrusher();
        break;
      case 21: // Apollo effect
        currentEffectNode = createApolloEffect();
        break;
      default:
        break;
    }
    return currentEffectNode;
  }

  function connectToEffect(node, effect, value) {
    changeEffect(effect, value);
    var effectInput = context.createGain();
    node.connect(dryGain);
    node.connect(effectInput);
    return outputMix;
  }

  return {
    note: (note) => {
      const osc = context.createOscillator();
      const osc2 = context.createOscillator();
      const osc3 = context.createOscillator();
      const env = context.createEnvelope(0, 0.4, 0.05, 0.35);
      const gain = context.createGain();
      gain.gain.value = 0.2;

      var dim = note % 2;

      osc.type = 'sine';
      osc.frequency.value = note;
      osc.start();
      osc.connect(env);

      // (dim===0 ? Math.pow(1.05946, 3) : Math.pow(1.05946, 4))

      osc2.type = 'sine';
      osc2.frequency.value = note * 2;
      osc2.start();
      osc2.connect(env);

      osc3.type = 'sine';
      osc3.frequency.value = note * 4;
      osc3.start();
      osc3.connect(env);

      gain.connect(context.destination);
      env.connect(gain);
      connectToEffect(env, 5, { delay: 0.2, depth: 3, speed: 2 });

      env.trigger(0.2);
    }
  };
}

const sounds = new Sounds();

/* Image Stuff */

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
const dropTarget = document.querySelector(".dropTarget");
const imgTarget = document.querySelector(".imgTarget");
const upload = document.querySelector(".upload");
const play = document.querySelector(".play");
const stop = document.querySelector(".stop");
const length = document.querySelector(".length");
const timing = document.querySelector(".timing");

const MAX_HEIGHT = 400;

var notes = [];

var playingTimeout = [];

play.addEventListener('click', () => {
  playingTimeout = [];

  notes.map((note, i) => {
    var timeoutId = setTimeout(() => {
      sounds.note(note);
      document.body.style.backgroundColor = '#'+Math.floor(Math.random()*16777215).toString(16);
    }, i*timing.value);
    playingTimeout.push(timeoutId);
    return note;
  });

});

stop.addEventListener('click', () => {
  playingTimeout.map((id) => {
    window.clearTimeout(id);
  });
});

function reloadPlay() {
  notes = getNotesFromRGB(length.value);
}

length.addEventListener('change', reloadPlay);

function render(src){
  let image = new Image();
  image.onload = function(){
    if(image.height > MAX_HEIGHT) {
      image.width *= MAX_HEIGHT / image.height;
      image.height = MAX_HEIGHT;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0, image.width, image.height);
    imgTarget.appendChild(canvas);
    notes = getNotesFromRGB(length.value);
  };
  image.src = src;
}

function loadImage(src){
  if(!src.type.match(/image.*/)){
    console.log("The dropped file is not an image: ", src.type);
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e){
    render(e.target.result);
  };
  reader.readAsDataURL(src);
}

upload.addEventListener('change', (e) => {
  e.preventDefault();
  loadImage(e.target.files[0]);
});

dropTarget.addEventListener("click", () => {
  upload.click();
});

dropTarget.addEventListener("dragover", function(e){
  e.preventDefault();
}, true);

dropTarget.addEventListener("drop", function(e){
  e.preventDefault();
  loadImage(e.dataTransfer.files[0]);
}, true);

function getNotesFromRGB(length = 1) {
  const height = canvas.height;
  const width = canvas.width;

  var data = ctx.getImageData(0, 0, width, height);

  const dataLength = data.data.length;
  var notes = [];

  for(let j=1; j <= length; j++) {
    var r = 0;
    var g = 0;
    var b = 0;

    var l = data.data.length/length;

    for (var i = 0; i < l; i += 4) {
      r += data.data[j*i];
      g += data.data[(j*i)+1];
      b += data.data[(j*i)+2];
    }

    r = Math.floor(r / (data.data.length / 4))*length;
    g = Math.floor(g / (data.data.length / 4))*length;
    b = Math.floor(b / (data.data.length / 4))*length;
    notes.push(
      r+
      g+
      b
    );
  }
  return notes;
}
