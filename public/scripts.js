

$(document).ready(function() {
    var $contact_form = $('#contact-form');
    var $submit_button = $contact_form.find('button[type="submit"]');

    $submit_button.click(function(e) {
        e.preventDefault();
        $.post('ajax/contact', $('#contact-form').serialize(), function() {
            alert('Message has been sent!');
        });
    });
});
