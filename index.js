require('dotenv').config();
const uuid = require('uuid').v4;
const express = require('express');
const querystring = require('querystring');

var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.REDIRECT_URI;
var token = {};
var scope = 'user-read-currently-playing';
var cors = require('cors');
var app = express();

app.use(cors());

app.get('/login', function(req, res) {
  /*var state = generateRandomString(16);*/
  var state = uuid();
  res.redirect(
      'https://accounts.spotify.com/authorize?' + querystring.stringify({
        response_type: 'code',
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state,
      }));
});

app.get('/callback', async function(req, res) {
  var code = req.query.code || null;
  var state = req.query.state || null;
  if (state === null) {
    res.redirect('/#' + querystring.stringify({error: 'state_mismatch'}));
  } else {
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': 'Basic ' +
            (new Buffer.from(client_id + ':' + client_secret)
                 .toString('base64'))
      }
    };

    let formBody = [];
    for (var property in authOptions.form) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(authOptions.form[property]);
      formBody.push(encodedKey + '=' + encodedValue);
    }
    formBody = formBody.join('&');

    var options = {
      headers: authOptions.headers,
      method: 'POST',
      body: formBody
    };
    var response = await fetch(authOptions.url, options);
    console.log('response1 ' + response.status);
    const text = await response.text();
    console.log(text);
    var json = JSON.parse(text);
    var t = {
      access_token: json['access_token'],
      expires_at: Date.now() + json['expires_in'] * 1000,
      refresh_token: json['refresh_token'],
      token_type: json['token_type'],
    };
    token[state] = t;
    res.redirect(process.env.BASE_URI + 'current-song?state=' + state)
  }
});

async function refreshAccessToken(token) {
  console.log('refreshAccessToken');
  console.log(token.refresh_token);
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' +
          (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: client_id
    }),
  }

  var response = await fetch('https://accounts.spotify.com/api/token', options);
  if (response.ok && response.status === 200) {
    const text = await response.text();
    var json = JSON.parse(text);
    var t = {
      access_token: json['access_token'],
      expires_at: Date.now() + json['expires_in'] * 1000,
      refresh_token: json['refresh_token'] || token.refresh_token,
      token_type: json['token_type']
    };
    return t;
  }
  console.error('response status != 200' + response.status);
  console.error(await response.text());

  return null;
}

app.get('/current-song', async function(req, res) {
  var state = req.query.state || null;

  if (!state) {
    res.status(400);
    res.json({error: 'access denied, please provide a valid state'});
    return;
  }
  if (!token[state]) {
    res.status(403);
    res.json({error: 'access denied, not logged in'});
    return;
  }

  if (Date.now() >= token[state].expires_at) {
    console.log('refreshing token..');
    console.log(token[state]);
    token[state] = await refreshAccessToken(token[state]);
    console.log('refreshed token :');
    console.log(token[state]);
  };

  var song = {
    name: null,
    album: null,
    artist: null,
    date: null,
    image: null,
    duration_ms: null,
    progress_ms: null,
    is_playing: null
  };
  authOptions = {
    url: 'https://api.spotify.com/v1/me/player/currently-playing',
    headers: {
      'Accept': 'application/json',
      'Authorization':
          token[state].token_type + ' ' + token[state].access_token,
    }
  };
  var options = {headers: authOptions.headers, method: 'GET'};
  var response = await fetch(authOptions.url, options);

  if (response.status === 204) {
    res.status(400);
    res.json({error: 'nothing playing'});
    return;
  }
  const text = await response.text();
  var music_json = JSON.parse(text);

  song.album = music_json['item']['album']['name'];
  song.artist = music_json['item']['artists'][0]['name'];
  song.name = music_json['item']['name']
  song.date = music_json['item']['album']['release_date'];
  song.image = music_json['item']['album']['images'][0];
  song.duration_ms = music_json['item']['duration_ms']
  song.progress_ms = music_json['progress_ms']
  song.is_playing = music_json['is_playing'];
  res.status(200).json(song);
})

app.listen(process.env.PORT)
