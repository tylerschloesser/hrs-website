$(document).ready(function() {

  $('#contact-submit-button').click(function(e) {
    var $button = $(this);
    e.preventDefault();
    $button.addClass('loading');
    var $form = $('#contact-submit-form');
    $.post('ajax/contact', $form.serialize(), function() {
      $form.find('.ui.positive.message').show();
    }).fail(function() {
      $form.find('.ui.negative.message').show();
    }).always(function() {
      $button.removeClass('loading');
    });
  });

  $('.ui.message .close.icon').click(function() {
    $(this).parent().hide();
  });

    var $contact_form = $('#contact-form');
    var $submit_button = $contact_form.find('button[type="submit"]');

    $submit_button.click(function(e) {
        e.preventDefault();
        $.post('ajax/contact', $('#contact-form').serialize(), function() {
            alert('Message has been sent!');
        });
    });

    $('#donate-button').click(function() {
      $(this).addClass('loading');
      $('#donate-form').submit();
    });

    $('img[src="ev1.jpg"]').click(function() {
      $('#ev1-modal').modal('show');
    });
    $('img[src="ev2.jpg"]').click(function() {
      $('#ev2-modal').modal('show');
    });
    $('img[src="ev3.jpg"]').click(function() {
      $('#ev3-modal').modal('show');
    });
    $('img[src="ev4.jpg"]').click(function() {
      $('#ev4-modal').modal('show');
    });

    $('img[src="gs1.jpg"]').click(function() {
      $('#gs1-modal').modal('show');
    });
    $('img[src="gs2.jpg"]').click(function() {
      $('#gs2-modal').modal('show');
    });
    $('img[src="gs3.jpg"]').click(function() {
      $('#gs3-modal').modal('show');
    });
    $('img[src="gs4.jpg"]').click(function() {
      e('#gs4-modal').modal('show');
    });
    $('img[src="gs5.jpg"]').click(function() {
      $('#gs5-modal').modal('show');
    });
    $('img[src="gs6.jpg"]').click(function() {
      $('#gs6-modal').modal('show');
    });
    $('img[src="gs7.jpg"]').click(function() {
      $('#gs7-modal').modal('show');
    });
    $('img[src="gs8.jpg"]').click(function() {
      $('#gs8-modal').modal('show');
    });

    $('img[src="ws1.jpg"]').click(function() {
      $('#ws1-modal').modal('show');
    });
    $('img[src="ws2.jpg"]').click(function() {
      $('#ws2-modal').modal('show');
    });

    $('img[src="pc1.jpg"]').click(function() {
      $('#pc1-modal').modal('show');
    });
    $('img[src="pc2.jpg"]').click(function() {
      $('#pc2-modal').modal('show');
    });
    $('img[src="pc3.jpg"]').click(function() {
      $('#pc3-modal').modal('show');
    });
    $('img[src="pc4.jpg"]').click(function() {
      $('#pc4-modal').modal('show');
    });

    $('img[src="mr1.jpg"]').click(function() {
      $('#mr1-modal').modal('show');
    });
    $('img[src="mr2.jpg"]').click(function() {
      $('#mr2-modal').modal('show');
    });
    $('img[src="mr3.jpg"]').click(function() {
      $('#mr3-modal').modal('show');
    });
    $('img[src="mr4.jpg"]').click(function() {
      $('#mr4-modal').modal('show');
    });
    $('img[src="mr5.jpg"]').click(function() {
      $('#mr5-modal').modal('show');
    });
});
