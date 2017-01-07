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
  open('/var/hrs-website/contact.txt', 'a') do |f|
    f << "#{request.ip} @ #{now.inspect}: #{params.inspect}\n"
  end
  200
end
