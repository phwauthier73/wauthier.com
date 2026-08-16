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

  function fillQuoteCard(payload) {
    var row = Array.isArray(payload) ? payload[0] : payload;
    if (!row || typeof row !== 'object') return;

    var card = document.querySelector('[data-quote-card]');
    if (!card) return;

    var citation = firstField(row, ['citation', 'Citation', 'quote']);
    if (!citation) return;   // Nothing usable — keep the fallback quote.

    var auteur     = firstField(row, ['auteur', 'Auteur', 'philosophe', 'author']);
    var commentaire = firstField(row, ['commentaire', 'Commentaire', 'explication', 'context']);

    card.querySelector('[data-quote-text]').textContent = quotationMarks(citation);

    var authorEl = card.querySelector('[data-quote-author]');
    if (auteur) authorEl.textContent = '— ' + auteur;

    var contextEl = card.querySelector('[data-quote-context]');
    if (commentaire) contextEl.textContent = commentaire;

    // The card is dated by the quote it shows, not by today: the workflow
    // falls back to the most recent past row when today's is missing.
    var date = parseQuoteDate(firstField(row, ['date', 'Date']));
    if (date) stampDate(date);
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
      .then(fillQuoteCard)
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

  function mountAllForms() {
    if (!formTpl || !sentTpl) return;
    Array.prototype.forEach.call(
      document.querySelectorAll('.contact-form-mount'),
      mountForm
    );
  }

  /* ------------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  render(routeKey(), { initial: true });
  stampDate();
  loadPhiloQuote();
  mountAllForms();
})();
