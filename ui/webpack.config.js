const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  mode: 'development',
  entry: './index.js',
  output: {
    path: __dirname + '/dist',
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.handlebars/,
        loader: 'handlebars-loader',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      templateParameters: require('./v1/index.json'),
      template: 'v1/index.handlebars',
    }),
  ],
}
