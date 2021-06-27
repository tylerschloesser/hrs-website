const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  mode: 'development',
  entry: './index.js',
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/',
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
