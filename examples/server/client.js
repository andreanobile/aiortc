var pc = new RTCPeerConnection();

// get DOM elements
var dataChannelLog = document.getElementById('data-channel'),
    iceConnectionLog = document.getElementById('ice-connection-state'),
    iceGatheringLog = document.getElementById('ice-gathering-state'),
    signalingLog = document.getElementById('signaling-state');

// register some listeners to help debugging
pc.addEventListener('icegatheringstatechange', function() {
    iceGatheringLog.textContent += ' -> ' + pc.iceGatheringState;
}, false);
iceGatheringLog.textContent = pc.iceGatheringState;

pc.addEventListener('iceconnectionstatechange', function() {
    iceConnectionLog.textContent += ' -> ' + pc.iceConnectionState;
}, false);
iceConnectionLog.textContent = pc.iceConnectionState;

pc.addEventListener('signalingstatechange', function() {
    signalingLog.textContent += ' -> ' + pc.signalingState;
}, false);
signalingLog.textContent = pc.signalingState;

// connect audio / video
pc.addEventListener('track', function(evt) {
    if (evt.track.kind == 'video')
        document.getElementById('video').srcObject = evt.streams[0];
    else
        document.getElementById('audio').srcObject = evt.streams[0];
});

// data channel
var dc = null, dcInterval;

function negotiate() {
    return pc.createOffer().then(function(offer) {
        return pc.setLocalDescription(offer);
    }).then(function() {
        // wait for ICE gathering to complete
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function() {
        var offer = pc.localDescription;
        document.getElementById('offer-sdp').textContent = offer.sdp;
        return fetch('/offer', {
            body: JSON.stringify(offer),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then(function(response) {
        return response.json();
    }).then(function(answer) {
        document.getElementById('answer-sdp').textContent = answer.sdp;
        return pc.setRemoteDescription(answer);
    });
}

function start() {
    document.getElementById('start').style.display = 'none';

    dc = pc.createDataChannel('chat');
    dc.onmessage = function(evt) {
        dataChannelLog.textContent += '< ' + evt.data + '\n';
    };

    var constraints = {
        audio: document.getElementById('use-audio').checked,
        video: document.getElementById('use-video').checked
    };

    var promise;
    if (constraints.audio || constraints.video) {
        if (constraints.video) {
            document.getElementById('media').style.display = 'block';
        }
        promise = navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            stream.getTracks().forEach(function(track) {
                pc.addTrack(track, stream);
            });
            return negotiate();
        });
    } else {
        promise = negotiate();
    }

    promise.then(function() {
        dcInterval = setInterval(function() {
            var message = 'ping';
            dataChannelLog.textContent += '> ' + message + '\n';
            dc.send(message);
        }, 1000);
    });

    document.getElementById('stop').style.display = 'inline-block';
}

function stop() {
    document.getElementById('stop').style.display = 'none';

    clearInterval(dcInterval);
    dc.close();
    pc.getSenders().forEach(function(sender) {
        sender.track.stop();
    });
    pc.close();
}