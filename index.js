require('dotenv').config();
const express = require('express');
const querystring = require('querystring');

var client_id = process.env.client_id;
var client_secret = process.env.client_secret;
var redirect_uri = 'http://localhost:8000/callback';
var token = {
  access_token: null,
  token_type: null,
  refresh_token: null,
  expires_in: null
};
var scope = 'user-read-currently-playing';

var app = express();

app.get('/login', function(req, res) {
  /*var state = generateRandomString(16);*/
  res.redirect(
      'https://accounts.spotify.com/authorize?' + querystring.stringify({
        response_type: 'code',
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
      }));
});

app.get('/callback', async function(req, res) {
  var code = req.query.code || null;
  var state = req.query.state || null;

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
          (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
    }
  };
  let formBody = [];
  for (var property in authOptions.form) {
    var encodedKey = encodeURIComponent(property);
    var encodedValue = encodeURIComponent(authOptions.form[property]);
    formBody.push(encodedKey + '=' + encodedValue);
  }
  formBody = formBody.join('&');

  var options = {headers: authOptions.headers, method: 'POST', body: formBody};
  var response = await fetch(authOptions.url, options);
  var json = await response.json();
  token.access_token = json['access_token'];
  token.expires_in = json['expires_in'];
  token.refresh_token = json['refresh_token'];
  token.token_type = json['token_type'];
});

app.get('/current-song', async function(req, res) {
  if (!token.access_token) {
    res.status(403);
    res.json({error: 'access denied, not logged in'});
  }
  var song = {name: null, album: null, artist: null, date: null, image: null};
  authOptions = {
    url: 'https://api.spotify.com/v1/me/player/currently-playing',
    headers: {
      'Accept': 'application/json',
      'Authorization': token.token_type + ' ' + token.access_token,
    }
  };
  var options = {headers: authOptions.headers, method: 'GET'};
  var response = await fetch(authOptions.url, options);
  var music_json = await response.json();
  if (music_json['is_playing']) {
    song.album = music_json['item']['album']['name'];
    song.artist = music_json['item']['artists'][0]['name'];
    song.name = music_json['item']['name']
    song.date = music_json['item']['album']['release_date'];
    song.image = music_json['item']['album']['images'][0];
    res.status(200).json(song);
  }
})

app.listen(8000)