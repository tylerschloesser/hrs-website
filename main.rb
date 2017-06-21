require 'sinatra'
require 'aws-sdk'

set :bind, '0.0.0.0'
set :port, 8080

Aws.config[:region] = 'us-west-2'

ses_client = Aws::SES::Client.new

puts ses_client.inspect

get '/' do
  erb :index
end

post '/ajax/contact' do
  now = Time.new
  htmlbody = "#{request.ip} @ #{now.inspect} <br> Name: #{params[:name]} <br> Email: #{params[:email]} <br> Message: #{params[:message]}\n"
  textbody = "#{request.ip} @ #{now.inspect}: #{params.inspect}\n"
  open('/var/hrs-website/contact.txt', 'a') do |f|
    f << textbody
  end

  begin
    resp = ses_client.send_email({
      destination: {
        to_addresses: [
          'tylerschloesser@gmail.com',
        ],
      },
      message: {
        body: {
          html: {
            charset: 'UTF-8',
            data: htmlbody,
          },
          text: {
            charset: 'UTF-8',
            data: textbody,
          }
        },
        subject: {
          charset: 'UTF-8',
          data: 'Message received from haitianrelief.org',
        },
      },
      source: 'tylerschloesser@gmail.com',
    });
    puts 'email sent!';
  rescue => e
    print "Email not sent. Error message: "
    puts e
  end

  200
end
