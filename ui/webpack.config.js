module.exports = {
  mode: 'development',
  entry: './v1/index.mustache',
  output: {
    path: __dirname + '/dist',
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.mustache/,
        loader: 'mustache-loader',
      },
    ],
  },
}
