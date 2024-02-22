$(document).ready(function () {
  // setup project image modal triggers
  $('[data-type="image-modal-trigger"]').each(function () {
    var smallImage = $(this)
    var $modal = smallImage.next()
    smallImage.click(function () {
      var $largeImage = $modal.find('img')
      if (!$largeImage.attr('src')) {
        // semantic ui doesn't set the size of the modal correctly when we lazy load images :(
        // wait until the image is loaded before showing the modal.
        // bad UX on slow networks but oh well.
        $largeImage.bind('load', () => {
          $modal.modal('show')
        })
        $largeImage.attr('src', $largeImage.data('src'))
      } else {
        $modal.modal('show')
      }
    })
  })
})
