const https = require("https");
const querystring = require("querystring");

const post = (hostname, path, accessToken, payload) =>
  new Promise((resolve, reject) => {
    const postData = querystring.stringify(payload);
    const options = {
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let buffer = "";
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
      res.setEncoding("utf8");
      res.on("data", (chunk) => (buffer += chunk));
      res.on("end", () => {
        console.log(`BODY: ${buffer}`);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: JSON.parse(buffer),
        });
      });
    });
    req.on("error", (e) => reject(e.message));
    req.write(postData);
    req.end();
  });

exports.handler = function (event) {
  console.log("event:", JSON.stringify(event, undefined, 2));

  for (var recordNum = 0; recordNum < event.Records.length; recordNum++) {
    const record = event.Records[recordNum];
    const { Subject, Message, Timestamp } = record.Sns;
    const SnsMessage = JSON.parse(Message);
    const message = `\nSubject: ${Subject}\nTimestamp: ${Timestamp}\nAlert: ${SnsMessage.Trigger.Namespace}\netric: ${SnsMessage.Trigger.MetricName}\nThreshold: ${SnsMessage.Trigger.Threshold}`;

    return await post(
      "notify-api.line.me",
      "/api/notify",
      "your-line-notify-token",
      {
        message,
      }
    );
  }
};