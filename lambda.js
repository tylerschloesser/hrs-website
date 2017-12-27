const AWS = require('aws-sdk');

AWS.config.update({region: 'us-west-2'});

exports.handler = (event, context, callback) => {

  const { email, subject, message } = event.body;

  const params = {
    Destination: {
      ToAddresses: [ email ]
    },
    Message: {
      Body: {
        Text: {
         Charset: "UTF-8",
         Data: message
        }
       },
       Subject: {
        Charset: 'UTF-8',
        Data: subject
       }
      },
    Source: 'tylerschloesser@gmail.com'
  };

	const sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();

  sendPromise.then(() => callback()).catch((err) => callback(err))
};

