const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const { WebpackManifestPlugin } = require('webpack-manifest-plugin')

module.exports = (_env, argv) => {
  const prod = argv.mode !== 'development'
  const mode = prod ? 'production' : 'development'

  return {
    stats: 'minimal',
    mode,
    entry: './index.js',
    output: {
      path: path.join(__dirname, 'dist'),
      filename: 'index.[contenthash].js',
      publicPath: '/',
      clean: true,
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
        templateParameters: require('./index.json'),
        template: 'index.handlebars',
        filename: prod ? 'index.[contenthash].html' : 'index.html',
        minify: false,
      }),
      new HtmlWebpackPlugin({
        template: 'concert.handlebars',
        filename: 'concert.html',
        inject: false,
      }),
      new CopyPlugin({
        patterns: [
          {
            from: path.join(__dirname, 'public'),
            to: path.join(__dirname, 'dist/public'),
          },
        ],
      }),
      new WebpackManifestPlugin({}),
    ],
    devServer: {
      historyApiFallback: true,
      watchFiles: ['index.handlebars'],
    },
    optimization: {
      minimize: false,
    },
  }
}
