const AWS = require('aws-sdk')

AWS.config.update({region: 'us-west-2'})

exports.handler = (event, context, callback) => {
  console.log('event!', JSON.stringify(event))
  const { email, name, message } = event

  const params = {
    Destination: {
      ToAddresses: [ 'tylerschloesser@gmail.com' ]
    },
    Message: {
      Body: {
        Text: {
         Charset: "UTF-8",
         Data: `received message from ${name} (${email})\n\n${message}`,
        }
       },
       Subject: {
        Charset: 'UTF-8',
        Data: 'message from haitianrelief.org'
       }
      },
    Source: 'tylerschloesser@gmail.com'
  }

    const sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise()

  sendPromise.then(() => callback(null, {})).catch((err) => callback(err))
}
