/* ==========================================================================
   Wauthier.com — routing, contact forms, daily date
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Contact form delivery
     ------------------------------------------------------------------------
     A form delivers to the URL in its own `data-endpoint` attribute, in
     index.html, next to the mount point. Forms without one fall back to
     CONTACT_ENDPOINT below; where neither is set, the form only shows its
     confirmation state and the message goes nowhere, as in the prototype.

     Set CONTACT_ENDPOINT to deliver every form to the same place; use
     `data-endpoint` to give one activity its own destination (a dedicated n8n
     workflow, say) or to switch the forms on one at a time.

     Either way the URL must accept a POST and allow cross-origin requests from
     the site's own domain — the call is made from the visitor's browser. The
     payload is JSON:

         { name, phone, email, message, activity, page }

     Anything other than a 2xx response surfaces the inline error message.

     All five forms currently share one destination: the n8n workflow
     « Formulaire contact wauthier.com », which routes on `activity`. Leave
     CONTACT_ENDPOINT empty only if the intent is for a form to confirm without
     delivering — the visitor cannot tell the difference.
     ---------------------------------------------------------------------- */
  var CONTACT_ENDPOINT = 'https://wauthiep.app.n8n.cloud/webhook/wauthier-contact';

  /* ------------------------------------------------------------------------
     Daily quote delivery
     ------------------------------------------------------------------------
     The philo screen's quote card is filled from the n8n workflow « Citation
     du jour wauthier.com », which reads the Google Sheets workbook
     « Citations matinales » and returns the row for today:

         { date, citation, auteur, commentaire }

     The URL must answer a GET and allow cross-origin requests from the site's
     own domain — the call is made from the visitor's browser.

     Whatever goes wrong — no endpoint set, network down, workflow disabled,
     empty workbook — the card keeps the quote written in index.html. That
     fallback is the reason nothing here surfaces an error to the visitor: a
     stale quote reads better than an error message on a page about slowing
     down. Keep a presentable quote in the HTML for that reason.
     ---------------------------------------------------------------------- */
  var PHILO_QUOTE_ENDPOINT = 'https://wauthiep.app.n8n.cloud/webhook/philo-citation-du-jour';

  /* ------------------------------------------------------------------------
     Daily quote subscription
     ------------------------------------------------------------------------
     The philo screen's sign-up form delivers to the n8n workflow
     « Inscription citation du jour wauthier.com », which writes the subscriber
     to the Google Sheets workbook « mailing_list_philo ». The payload is JSON:

         { firstname, lastname, email, comment, page }

     First name, last name and email are required; `comment` is free text and
     often empty. The workflow writes one row per address — a second sign-up
     with the same email updates that row rather than adding a second one, so
     the last submission wins on every column.

     Like the contact forms, the URL must accept a POST and allow cross-origin
     requests from the site's own domain; anything other than a 2xx response
     surfaces the inline error message. Leaving this empty makes the form
     confirm without subscribing anyone — the visitor cannot tell.
     ---------------------------------------------------------------------- */
  var PHILO_SUBSCRIBE_ENDPOINT = 'https://wauthiep.app.n8n.cloud/webhook/philo-inscription';

  /* ------------------------------------------------------------------------
     Routes
     ---------------------------------------------------------------------- */
  var ROUTES = {
    '':              'home',
    '/':             'home',
    '/ia':           'ia',
    '/energie':      'energie',
    '/architecture': 'archi',
    '/philo':        'philo',
    '/kawa':         'kawa',
    '/sweetlo':      'sweet'
  };

  var TITLES = {
    home:    'Wauthier.com — Espace familial Wauthier',
    ia:      'Consultance IA & RH — Atelier Déclic | Wauthier.com',
    energie: 'Certificats & audits énergétiques PEB | Wauthier.com',
    archi:   'Architecture | Wauthier.com',
    philo:   'Le coin philo | Wauthier.com',
    kawa:    'Espace Kawa | Wauthier.com',
    sweet:   'SweetLo — pâtisserie sur commande | Wauthier.com'
  };

  var screens  = Array.prototype.slice.call(document.querySelectorAll('[data-screen]'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link[data-route-link]'));

  function routeKey() {
    var raw = window.location.hash.replace(/^#/, '');
    if (Object.prototype.hasOwnProperty.call(ROUTES, raw)) return ROUTES[raw];
    // Tolerate a trailing slash, e.g. #/ia/
    var trimmed = raw.replace(/\/+$/, '');
    if (Object.prototype.hasOwnProperty.call(ROUTES, trimmed)) return ROUTES[trimmed];
    return 'home';
  }

  function render(key, opts) {
    opts = opts || {};

    screens.forEach(function (el) {
      var active = el.getAttribute('data-screen') === key;
      el.hidden = !active;
      // Restart the fade-up so each screen change animates, as in the design.
      if (active && !opts.initial) {
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';
      }
    });

    navLinks.forEach(function (a) {
      if (a.getAttribute('data-route-link') === key) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });

    document.title = TITLES[key] || TITLES.home;

    if (!opts.initial) window.scrollTo({ top: 0 });
  }

  window.addEventListener('hashchange', function () { render(routeKey()); });

  /* ------------------------------------------------------------------------
     Daily date on the philo screen
     ---------------------------------------------------------------------- */
  function stampDate(date) {
    var el = document.querySelector('[data-today]');
    if (!el) return;
    var s = (date || new Date()).toLocaleDateString('fr-BE', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
    el.textContent = s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ------------------------------------------------------------------------
     Quote of the day on the philo screen
     ---------------------------------------------------------------------- */
  function firstField(row, names) {
    for (var i = 0; i < names.length; i++) {
      var value = row[names[i]];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  // The sheet stores dates as dd/mm/yyyy; the workflow passes them through
  // untouched. Date.parse would read that as a US month/day, so split it.
  function parseQuoteDate(value) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
    if (!m) return null;
    var date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(date.getTime()) ? null : date;
  }

  function quotationMarks(text) {
    return /^[«"“]/.test(text) ? text : '« ' + text + ' »';
  }

  // The archive as served, oldest first, and the entry currently on screen.
  var quotes  = [];
  var current = 0;

  function normalise(row) {
    if (!row || typeof row !== 'object') return null;
    var citation = firstField(row, ['citation', 'Citation', 'quote']);
    if (!citation) return null;
    return {
      citation:    citation,
      auteur:      firstField(row, ['auteur', 'Auteur', 'philosophe', 'author']),
      commentaire: firstField(row, ['commentaire', 'Commentaire', 'explication', 'context']),
      date:        firstField(row, ['date', 'Date']),
      jour:        row.jour === true
    };
  }

  function showQuote(index) {
    var card  = document.querySelector('[data-quote-card]');
    var quote = quotes[index];
    if (!card || !quote) return;
    current = index;

    card.querySelector('[data-quote-text]').textContent = quotationMarks(quote.citation);

    if (quote.auteur) {
      card.querySelector('[data-quote-author]').textContent = '— ' + quote.auteur;
    }
    if (quote.commentaire) {
      card.querySelector('[data-quote-context]').textContent = quote.commentaire;
    }

    // The card is dated by the quote on screen, not by today — the visitor may
    // have walked back through the archive.
    var date = parseQuoteDate(quote.date);
    if (date) stampDate(date);

    var navDate = card.querySelector('[data-quote-nav-date]');
    if (navDate) navDate.textContent = quote.date || '';

    var prev = card.querySelector('[data-quote-prev]');
    var next = card.querySelector('[data-quote-next]');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= quotes.length - 1;
  }

  function setupQuotes(payload) {
    var rows = Array.isArray(payload) ? payload : [payload];
    var card = document.querySelector('[data-quote-card]');
    if (!card) return;

    quotes = [];
    for (var i = 0; i < rows.length; i++) {
      var quote = normalise(rows[i]);
      if (quote) quotes.push(quote);
    }
    if (!quotes.length) return;   // Nothing usable — keep the fallback quote.

    // The workflow flags today's entry; without a flag, show the newest.
    var start = quotes.length - 1;
    for (var j = 0; j < quotes.length; j++) {
      if (quotes[j].jour) start = j;
    }

    var nav = card.querySelector('[data-quote-nav]');
    if (nav && quotes.length > 1) {
      nav.hidden = false;
      card.querySelector('[data-quote-prev]').addEventListener('click', function () {
        showQuote(current - 1);
      });
      card.querySelector('[data-quote-next]').addEventListener('click', function () {
        showQuote(current + 1);
      });
    }

    showQuote(start);
  }

  function loadPhiloQuote() {
    if (!PHILO_QUOTE_ENDPOINT) return;
    if (!document.querySelector('[data-quote-card]')) return;

    fetch(PHILO_QUOTE_ENDPOINT, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(setupQuotes)
      .catch(function () { /* Keep the quote written in index.html. */ });
  }

  /* ------------------------------------------------------------------------
     Contact forms
     ---------------------------------------------------------------------- */
  var formTpl = document.getElementById('contact-form-tpl');
  var sentTpl = document.getElementById('contact-sent-tpl');

  function mountForm(mount) {
    var activity = mount.getAttribute('data-activity') || 'Contact';
    var accent   = mount.getAttribute('data-accent')   || '#16150f';
    var endpoint = mount.getAttribute('data-endpoint') || CONTACT_ENDPOINT;
    mount.style.setProperty('--accent', accent);

    mount.textContent = '';
    var form = formTpl.content.cloneNode(true).querySelector('form');
    var errorBox = form.querySelector('.cform__error');
    var submit   = form.querySelector('.cform__submit');

    function fail(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.hidden = true;

      if (!form.checkValidity()) {
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) firstInvalid.focus();
        fail('Merci de compléter les champs obligatoires (nom, e-mail et message).');
        return;
      }

      var data = {
        name:     form.elements.name.value.trim(),
        phone:    form.elements.phone.value.trim(),
        email:    form.elements.email.value.trim(),
        message:  form.elements.message.value.trim(),
        activity: activity,
        page:     window.location.href
      };

      if (!endpoint) {
        // No backend wired up yet — mirror the prototype's confirmation state.
        showSent(mount, activity, accent);
        return;
      }

      submit.disabled = true;
      var original = submit.firstChild.nodeValue;
      submit.firstChild.nodeValue = 'Envoi… ';

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          showSent(mount, activity, accent);
        })
        .catch(function () {
          submit.disabled = false;
          submit.firstChild.nodeValue = original;
          fail("L'envoi a échoué. Réessayez, ou écrivez directement à philippe@wauthier.com.");
        });
    });

    mount.appendChild(form);
  }

  function showSent(mount, activity, accent) {
    mount.textContent = '';
    var node = sentTpl.content.cloneNode(true);
    var panel = node.querySelector('.cform-sent');
    node.querySelector('[data-activity-name]').textContent = activity;
    node.querySelector('.cform-sent__again').addEventListener('click', function () {
      mountForm(mount);
      var input = mount.querySelector('input');
      if (input) input.focus();
    });
    mount.appendChild(node);
    panel.focus();
  }

  /* ------------------------------------------------------------------------
     Daily quote sign-up on the philo screen
     ------------------------------------------------------------------------
     Same shape as the contact forms — a template cloned into its mount, an
     inline error, a confirmation panel — but it subscribes rather than sends a
     message, so it has its own endpoint and its own two templates. Only the
     comment is optional; the browser enforces the other three via `required`.
     ---------------------------------------------------------------------- */
  var subscribeTpl = document.getElementById('subscribe-form-tpl');
  var subscribedTpl = document.getElementById('subscribe-done-tpl');

  function mountSubscribeForm(mount) {
    var accent   = mount.getAttribute('data-accent')   || '#16150f';
    var endpoint = mount.getAttribute('data-endpoint') || PHILO_SUBSCRIBE_ENDPOINT;
    mount.style.setProperty('--accent', accent);

    mount.textContent = '';
    var form = subscribeTpl.content.cloneNode(true).querySelector('form');
    var errorBox = form.querySelector('.cform__error');
    var submit   = form.querySelector('.cform__submit');

    function fail(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.hidden = true;

      if (!form.checkValidity()) {
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) firstInvalid.focus();
        fail("Merci d'indiquer votre prénom, votre nom et une adresse e-mail valide.");
        return;
      }

      var data = {
        firstname: form.elements.firstname.value.trim(),
        lastname:  form.elements.lastname.value.trim(),
        email:     form.elements.email.value.trim(),
        comment:   form.elements.comment.value.trim(),
        page:      window.location.href
      };

      if (!endpoint) {
        // No backend wired up yet — confirm without subscribing anyone.
        showSubscribed(mount, data.email);
        return;
      }

      submit.disabled = true;
      var original = submit.firstChild.nodeValue;
      submit.firstChild.nodeValue = 'Inscription… ';

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          showSubscribed(mount, data.email);
        })
        .catch(function () {
          submit.disabled = false;
          submit.firstChild.nodeValue = original;
          fail("L'inscription a échoué. Réessayez, ou écrivez directement à philippe@wauthier.com.");
        });
    });

    mount.appendChild(form);
  }

  function showSubscribed(mount, email) {
    mount.textContent = '';
    var node = subscribedTpl.content.cloneNode(true);
    var panel = node.querySelector('.cform-sent');
    node.querySelector('[data-subscriber-email]').textContent = email;
    node.querySelector('.cform-sent__again').addEventListener('click', function () {
      mountSubscribeForm(mount);
      var input = mount.querySelector('input');
      if (input) input.focus();
    });
    mount.appendChild(node);
    panel.focus();
  }

  function mountAllForms() {
    if (formTpl && sentTpl) {
      Array.prototype.forEach.call(
        document.querySelectorAll('.contact-form-mount'),
        mountForm
      );
    }
    if (subscribeTpl && subscribedTpl) {
      Array.prototype.forEach.call(
        document.querySelectorAll('.subscribe-form-mount'),
        mountSubscribeForm
      );
    }
  }

  /* ------------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  render(routeKey(), { initial: true });
  stampDate();
  loadPhiloQuote();
  mountAllForms();
})();
