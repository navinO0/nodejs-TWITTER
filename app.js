const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

let db = null;

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDbAndTheServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("db server is started at 3000 port");
    });
  } catch (e) {
    console.log(`db error due to ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndTheServer();

const verifyToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRETE_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        const username = payload.username;
        const getUserCredentials = `
         SELECT * FROM user WHERE username = '${username}';
            `;
        const userDets = await db.get(getUserCredentials);

        request.userDetails = userDets;

        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const isThereUser = `
  SELECT * FROM user WHERE username = '${username}';
  `;
  const user = await db.get(isThereUser);
  if (user === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const cryptPass = await bcrypt.hash(password, 10);
      const insertUserQuery = `
      INSERT INTO user(name, username, password, gender)
      VALUES('${name}','${username}', '${cryptPass}','${gender}');
      `;
      await db.run(insertUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const user = await db.get(getUserQuery);

  if (user !== undefined) {
    const checkPass = await bcrypt.compare(password, user.password);
    if (checkPass) {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "MY_SECRETE_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get("/user/tweets/feed/", verifyToken, async (request, response) => {
  const username = request.username;

  const { user_id, name, password, gender } = request.userDetails;
  const getTweetsQuery = `
  SELECT user.username as username,tweet.tweet as tweet, tweet.date_time as dateTime  FROM (user inner join follower ON user.user_id = follower.following_user_id) AS user_follower INNER JOIN tweet ON user_follower.following_user_id = tweet.user_id
  WHERE 
  follower.follower_user_id = ${user_id}
  ORDER BY 
  tweet.date_time DESC
  LIMIT  4;
  `;
  const tweetsDbDets = await db.all(getTweetsQuery);
  response.send(tweetsDbDets);
});

app.get("/user/following/", verifyToken, async (request, response) => {
  const username = request.username;
  const { user_id, name, password, gender } = request.userDetails;
  const getFollowerNamesQuery = `
  SELECT (SELECT name FROM
    user WHERE follower.following_user_id = user_id GROUP BY username) as name FROM user inner join follower ON user.user_id = follower.follower_user_id
   WHERE 
   follower.follower_user_id = ${user_id}
  ;
  `;
  const followerName = await db.all(getFollowerNamesQuery);
  response.send(followerName);
});

app.get("/user/followers/", verifyToken, async (request, response) => {
  const username = request.username;
  const { user_id, name, password, gender } = request.userDetails;
  const getFollowerNamesQuery = `
  SELECT (SELECT name FROM
    user WHERE follower.follower_user_id = user_id GROUP BY username) as name FROM user inner join follower ON user.user_id = follower.following_user_id
   WHERE follower.following_user_id = ${user_id}
  ;
  `;
  const followerName = await db.all(getFollowerNamesQuery);
  response.send(followerName);
});

app.get("/tweets/:tweetId/", verifyToken, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const { user_id, name, password, gender } = request.userDetails;
  //   const isUserFollowingQuery = `
  //   SELECT tweet.tweet,count(like.like_id) as likes, count(reply.reply_id) as replies, tweet.date_time as dateTime FROM (((user INNER JOIN tweet on user.user_id = tweet.user_id) AS user_tweet INNER JOIN reply on user_tweet.tweet_id = reply.tweet_id) AS user_tweet_reply INNER JOIN like on user_tweet_reply.tweet_id = like.tweet_id) AS user_tweet_reply_like INNER JOIN follower on follower.following_user_id = user_tweet_reply_like.user_id
  //   WHERE tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${user_id}
  //   `;
  const isUserFollowingQuery = `
SELECT tweet.tweet,count(like.like_id) as likes, count(reply.reply_id) as replies, tweet.date_time as dateTime FROM ((tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) as tweet_like INNER JOIN reply on tweet.tweet_id = reply.tweet_id) AS tweet_like_reply INNER JOIN follower ON follower.following_user_id = tweet_like_reply.user_id
WHERE tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${user_id}`;
  const isUserFollowing = await db.get(isUserFollowingQuery);

  if (isUserFollowing.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(isUserFollowing);
  }
});

app.get("/user/tweets/", verifyToken, async (request, response) => {
  const { user_id, name, password, gender } = request.userDetails;

  const tweetsQuery = `
SELECT tweet.tweet as tweet, (SELECT count(*)  FROM like WHERE like.tweet_id = tweet.tweet_id) as likes, (SELECT count(*) as replies FROM reply WHERE reply.tweet_id = tweet.tweet_id) as replies, tweet.date_time as dateTime FROM tweet
WHERE
tweet.user_id = ${user_id}
`;

  const tweets = await db.all(tweetsQuery);
  response.send(tweets);
});

app.get("/tweets/:tweetId/likes/", verifyToken, async (request, response) => {
  const { tweetId } = request.params;
  const { user_id, name, password, gender } = request.userDetails;
  const getLikesDateQuery = `
  SELECT tweet.tweet,count(like.like_id) as likes, count(reply.reply_id) as replies, tweet.date_time as dateTime FROM (((user INNER JOIN tweet on user.user_id = tweet.user_id) AS user_tweet INNER JOIN reply on user_tweet.tweet_id = reply.tweet_id) AS user_tweet_reply INNER JOIN like on user_tweet_reply.tweet_id = like.tweet_id) AS user_tweet_reply_like INNER JOIN follower on follower.follower_user_id = user_tweet_reply_like.user_id
  WHERE tweet.tweet_id = ${tweetId} and follower.following_user_id = ${user_id}
  `;

  const tweetLikeQuery = `
  SELECT (SELECT username from user where user_id = like.user_id) as username from ((tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS tweet_like INNER JOIN user ON user.user_id = tweet_like.user_id) AS tweet_like_user INNER JOIN follower ON tweet_like_user.user_id = follower.follower_user_id
  WHERE tweet.tweet_id = ${tweetId}
  `;

  const likesData = await db.all(tweetLikeQuery);
  response.send(likesData);
});

app.post("/user/tweets/", verifyToken, async (request, response) => {
  const { tweet } = request.body;
  const { user_id, name, password, gender } = request.userDetails;
  const insertQuery = `
    INSERT INTO tweet(tweet,user_id) VALUES('${tweet}',${user_id})
`;
  await db.run(insertQuery);
  response.send("Created a Tweet");
});

app.get("/tweets/:tweetId/replies/", verifyToken, (request, response) => {
  const { tweetId } = request.params;
});

app.delete("/tweets/:tweetId/", verifyToken, async (request, response) => {
  const { tweetId } = request.params;
  const { user_id, name, password, gender } = request.userDetails;
  const isValidUserQuery = `
   SELECT * from tweet WHERE tweet.tweet_id = ${tweetId} and tweet.user_id = ${user_id}
   `;
  const isValidUser = await db.get(isValidUserQuery);
  if (isValidUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
     DELETE FROM tweet WHERE tweet.tweet_id = ${tweetId};
     `;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
