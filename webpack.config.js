const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './dev.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
	module: {
		rules: [ 
			{
				test: /\.mustache$/,
				loader: 'mustache-loader'
			},
      {
        test: /\.json$/,
        loader: 'json-loader'
      },
		]
	},
  plugins: [new HtmlWebpackPlugin()],
};
