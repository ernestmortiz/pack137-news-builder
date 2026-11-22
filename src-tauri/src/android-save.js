// Android only. Added by lib.rs as an initialization script, because the Android web view has no
// download handler. It lets the page's own "save a file" links (a hidden <a download> pointing at
// a Blob address) reach MainActivity, which writes the file into Downloads. The page is unchanged.
//
// It reads the Blob with FileReader, not a network request, because the page's policy
// (connect-src 'none') blocks those. It hands the result to the one object MainActivity
// registers, pack137Save, which accepts messages only from the app's own origin and saves only
// .json and .jpg files.
(function () {
  'use strict';
  if (window.top !== window) return;

  var MAX_BYTES = 8 * 1024 * 1024;
  var blobs = new Map();
  var create = URL.createObjectURL.bind(URL);
  var revoke = URL.revokeObjectURL.bind(URL);

  URL.createObjectURL = function (object) {
    var url = create(object);
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    blobs.delete(url);
    return revoke(url);
  };

  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      var link = target instanceof Element ? target.closest('a[download]') : null;
      if (link === null || !link.href.startsWith('blob:')) return;
      var blob = blobs.get(link.href);
      var port = window.pack137Save;
      if (blob === undefined || !port) return;
      event.preventDefault();
      if (blob.size > MAX_BYTES) return;
      var name = link.getAttribute('download') || '';
      var reader = new FileReader();
      reader.onload = function () {
        port.postMessage(JSON.stringify({ name: name, dataUrl: String(reader.result) }));
      };
      reader.readAsDataURL(blob);
    },
    true,
  );
})();
