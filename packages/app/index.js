$(document).ready(function () {
  // Initialize share button popups
  $('#share-facebook, #share-twitter, #share-email, #share-copy').popup({
    position: 'top center',
  })

  // Add to Calendar buttons
  var event = {
    title: 'It Takes A Village Concert',
    description:
      '20th Anniversary Ecumenical Fundraising Concert supporting vital projects in Ganthier, Haiti.',
    location: 'Ezekiel Lutheran Church, 202 South 2nd St, River Falls, WI',
    start: '2026-02-22T16:00:00',
    end: '2026-02-22T19:00:00',
  }

  $('#add-google-cal').click(function (e) {
    e.preventDefault()
    dataLayer.push({
      event: 'calendar_click',
      calendar_type: 'google',
    })
    var startDate = event.start.replace(/[-:]/g, '').replace('T', 'T')
    var endDate = event.end.replace(/[-:]/g, '').replace('T', 'T')
    var url =
      'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' +
      encodeURIComponent(event.title) +
      '&dates=' +
      startDate +
      '/' +
      endDate +
      '&details=' +
      encodeURIComponent(event.description) +
      '&location=' +
      encodeURIComponent(event.location)
    window.open(url, '_blank')
  })

  $('#add-ical').click(function (e) {
    e.preventDefault()
    dataLayer.push({
      event: 'calendar_click',
      calendar_type: 'ical',
    })
    var startDate = event.start.replace(/[-:]/g, '')
    var endDate = event.end.replace(/[-:]/g, '')
    var icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Haitian Relief Services//ITAV Concert//EN',
      'BEGIN:VEVENT',
      'DTSTART:' + startDate,
      'DTEND:' + endDate,
      'SUMMARY:' + event.title,
      'DESCRIPTION:' + event.description,
      'LOCATION:' + event.location,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    var blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    var link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'itav-concert-2026.ics'
    link.click()
  })

  // Share buttons
  var shareUrl = 'https://haitianrelief.org/concert.html'
  var shareText =
    'It Takes A Village Concert - 20th Anniversary Ecumenical Fundraising Concert supporting Haiti. Feb 22, 2026'

  $('#share-facebook').click(function (e) {
    e.preventDefault()
    dataLayer.push({
      event: 'social_share',
      share_platform: 'facebook',
    })
    window.open(
      'https://www.facebook.com/sharer/sharer.php?u=' +
        encodeURIComponent(shareUrl),
      '_blank'
    )
  })

  $('#share-twitter').click(function (e) {
    e.preventDefault()
    dataLayer.push({
      event: 'social_share',
      share_platform: 'twitter',
    })
    window.open(
      'https://twitter.com/intent/tweet?url=' +
        encodeURIComponent(shareUrl) +
        '&text=' +
        encodeURIComponent(shareText),
      '_blank'
    )
  })

  $('#share-email').click(function (e) {
    e.preventDefault()
    dataLayer.push({
      event: 'social_share',
      share_platform: 'email',
    })
    window.location.href =
      'mailto:?subject=' +
      encodeURIComponent('It Takes A Village Concert 2026') +
      '&body=' +
      encodeURIComponent(shareText + '\n\n' + shareUrl)
  })

  $('#share-copy').click(function (e) {
    e.preventDefault()
    dataLayer.push({
      event: 'social_share',
      share_platform: 'copy_link',
    })
    navigator.clipboard.writeText(shareUrl)
    var $toast = $('#toast')
    $toast.addClass('visible')
    setTimeout(function () {
      $toast.removeClass('visible')
    }, 2000)
  })

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
