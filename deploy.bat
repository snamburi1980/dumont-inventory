@echo off
npm run build
git add .
git commit -m update
git push
echo Done!