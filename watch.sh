function compile {
  clear
  echo "compiling - `date`"
  if ./compile.sh; then
    echo "success"
  else
    echo "failure"
  fi
}

compile
fswatch -o index.yaml index.mustache | (while read; do compile; done)
