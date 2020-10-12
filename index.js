const AWS = require("aws-sdk");
const axios = require("axios");
const FormData = require("form-data");

let lineNotifyToken = process.env.LINE_NOTIFY_TOKEN
  ? process.env.LINE_NOTIFY_TOKEN
  : "";
let discordUrl = process.env.DISCORD_URL ? process.env.DISCORD_URL : "";

let widgetDefinition = {
  MetricWidget: {
    width: 600,
    height: 400,
    start: "-PT3H", // 3 小時的資料
    end: "PT0H",
    view: "timeSeries",
    stacked: false,
    metrics: [],
    stat: "Average",
    yAxis: {
      left: {
        min: 0,
        max: 0,
      },
    },
    period: 60,
    title: "Snapshot Graphs",
    annotations: {
      horizontal: [
        {
          color: "#ff6961",
          label: "Trouble threshold start",
          value: 0,
        },
      ],
    },
  },
};

const lineNotify = async (url, accessToken, payload) => {
  let formData = new FormData();
  formData.append("message", payload.message);
  formData.append("imageFile", payload.image, {
    filename: "CloudWatch.png",
    contentType: "image/png",
  });

  return await axios.post(url, formData, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...formData.getHeaders(),
    },
  });
};

const discord = async (url, payload) => {
  let formData = new FormData();
  formData.append("payload_json", JSON.stringify(payload.message));
  formData.append("imageFile", payload.image, {
    filename: "CloudWatch.png",
    contentType: "image/png",
  });

  return await axios.post(url, formData, {
    headers: {
      ...formData.getHeaders(),
    },
  });
};

const makeLineMessage = (subject, timestamp, trigger, element) => {
  let message = "\n";

  message += `Subject: ${subject}\n`;
  message += `Timestamp: ${timestamp}\n`;

  for (var prop in element) {
    message += `${element[prop]}: ${trigger[element[prop]]}\n`;
  }
  return message;
};

const makeDiscordMessage = (subject, timestamp, trigger, element) => {
  const message = {
    username: "AWS",
    avatar_url:
      "https://a0.awsstatic.com/libra-css/images/logos/aws_logo_smile_1200x630.png",
    embeds: [
      {
        color: 16711680,
        fields: [],
      },
    ],
  };

  message.embeds[0].fields.push({
    name: "Subject",
    value: subject,
    inline: true,
  });
  message.embeds[0].fields.push({
    name: "Timestamp",
    value: timestamp,
    inline: true,
  });

  for (var prop in element) {
    message.embeds[0].fields.push({
      name: element[prop],
      value: trigger[element[prop]],
      inline: true,
    });
  }

  return message;
};

exports.handler = function (event) {
  console.log("event:", JSON.stringify(event, undefined, 2));

  for (var recordNum = 0; recordNum < event.Records.length; recordNum++) {
    const record = event.Records[recordNum];
    const { Subject, Message, Timestamp } = record.Sns;
    const SnsMessage = JSON.parse(Message);
    const { Trigger } = SnsMessage;

    var cloudwatch = new AWS.CloudWatch();

    cloudwatch.getMetricWidgetImage(
      getWidgetDefinition(Trigger, SnsMessage),
      async function (err, data) {
        if (err) console.log(err, err.stack);
        else {
          var image = Buffer.from(data.MetricWidgetImage);

          if (lineNotifyToken !== "") {
            await lineNotify(
              "https://notify-api.line.me/api/notify",
              lineNotifyToken,
              {
                message: makeLineMessage(Subject, Timestamp, Trigger, [
                  "Namespace",
                  "MetricName",
                  "Threshold",
                ]),
                image,
              }
            );
          }

          if (discordUrl !== "") {
            await discord(discordUrl, {
              message: makeDiscordMessage(Subject, Timestamp, Trigger, [
                "Namespace",
                "MetricName",
                "Threshold",
              ]),
              image,
            });
          }
        }
      }
    );
  }
};

function getWidgetDefinition(trigger, message) {
  var metrics = [];
  var metric = [
    trigger.Namespace,
    trigger.MetricName,
    trigger.Dimensions[0].name,
    trigger.Dimensions[0].value,
  ];

  metrics.push(metric);
  widgetDefinition.MetricWidget.metrics = metrics;
  widgetDefinition.MetricWidget.yAxis.left.max = getYMax(
    message.NewStateReason
  );
  widgetDefinition.MetricWidget.title = trigger.MetricName;
  widgetDefinition.MetricWidget.annotations.horizontal[0].value =
    trigger.Threshold;

  var mw = JSON.stringify(widgetDefinition.MetricWidget);
  widgetDefinition.MetricWidget = mw;

  return widgetDefinition;
}

function getYMax(s) {
  var regex1 = /\[[0-9]*.[0-9]/;
  var datapoint = regex1.exec(s)[0].substring(1);

  return datapoint * 3;
}
