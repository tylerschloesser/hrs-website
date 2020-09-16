# steps to develop

```
brew install fswatch

npm -g i live-server mustache yaml2json
```

watch yaml & mustache
```
./watch.sh
```

auto reload index.html
```
live-server --ignore=index.mustache,index.yaml,index.json .
```

manually compile yaml & mustache to html
```
./compile.sh
```

# steps to update

1. navigate to s3 bucket: haitianrelief.org
1. upload index.html and/or other changed files
1. navigate to cloudfront and create invalidation on changed files
