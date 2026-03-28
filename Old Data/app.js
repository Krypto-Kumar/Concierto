import jsmediatags from 'jsmediatags';

file = "/downloadsss.mp3"

const extractCoverArt = (file) => {
  jsmediatags.read(file, {
    onSuccess: function(tag) {
      const picture = tag.tags.picture;
      if (picture) {
        const base64String = "";
        for (let i = 0; i < picture.data.length; i++) {
          base64String += String.fromCharCode(picture.data[i]);
        }
        const base64 = "data:" + picture.format + ";base64," + window.btoa(base64String);
        // Display image using base64
        document.getElementById('cover-art').src = base64;
      }
    },
    onError: function(error) {
      console.log('Error reading tags:', error);
    }
  });
};   

console.log(extractCoverArt)