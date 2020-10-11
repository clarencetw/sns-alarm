const AWS = require("aws-sdk");
const axios = require("axios");
const FormData = require("form-data");

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

exports.handler = function (event) {
  console.log("event:", JSON.stringify(event, undefined, 2));

  for (var recordNum = 0; recordNum < event.Records.length; recordNum++) {
    const record = event.Records[recordNum];
    const { Subject, Message, Timestamp } = record.Sns;
    const SnsMessage = JSON.parse(Message);
    const message = `\nSubject: ${Subject}\nTimestamp: ${Timestamp}\nAlert: ${SnsMessage.Trigger.Namespace}\netric: ${SnsMessage.Trigger.MetricName}\nThreshold: ${SnsMessage.Trigger.Threshold}`;

    var cloudwatch = new AWS.CloudWatch();

    cloudwatch.getMetricWidgetImage(
      getWidgetDefinition(SnsMessage.Trigger, SnsMessage),
      async function (err, data) {
        if (err) console.log(err, err.stack);
        else {
          var image = Buffer.from(data.MetricWidgetImage);

          await lineNotify(
            "https://notify-api.line.me/api/notify",
            "your-line-notify-token",
            {
              message,
              image,
            }
          );
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
