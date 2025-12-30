window.addEventListener('message', (event) => {
  if (event.data.type === 'theme') {
    if (event.data.theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }
});
