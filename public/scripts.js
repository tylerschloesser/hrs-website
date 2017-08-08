$(document).ready(function() {

  $('#contact-submit-button').click(function(e) {
    var $button = $(this);
    e.preventDefault();
    $button.addClass('loading');
    var $form = $('#contact-submit-form');
    $.post('ajax/contact', $form.serialize(), function() {
      $form.find('.ui.positive.message').removeClass('hidden');
    }).fail(function() {
      $form.find('.ui.negative.message').removeClass('hidden');
    }).always(function() {
      $button.removeClass('loading');
    });
  });

  $('.ui.message .close.icon').click(function() {
    $(this).parent().addClass('hidden');
  });

  $('[data-type="image-modal-trigger"]').each(function() {
    var $image = $(this);
    var $modal = $image.next();
    $image.click(function() {
      $modal.modal('show');
    });
  });

  $('#donate-button').click(function() {
    $(this).addClass('loading');
    $('#donate-form').submit();
  });
});
