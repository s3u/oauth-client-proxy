var redis = require('redis'),
  sys = require('sys')

var redisClient = redis.createClient()
redisClient.get('fool', function(err, res) {
  if(err) {
    sys.log(err);
  }
  else if(res) {
    sys.log(res);
  }
  redisClient.quit()
})