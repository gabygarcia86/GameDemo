Gaby's Game's Demo GitHub


NEW GIT repository : 
https://www.youtube.com/watch?v=TXV8-IX2FXE&list=PL4LCPTX7C8QHlln0FzaXAE50rlvdZlBnn&index=8

*File size limit, must be under 100 MB.

1. Navigate to folder (in VS code and in terminal) you wish to create a GIT repository with
2. Terminal : git init
3. Terminal : git add .
4. Terminal : git commit -m "initial commit"
5. Navigate to github.com, go to user page, go to Repositories tab / page
6. Click green button "New"
7. Under "Repository Name*" put the exact same name of folder you wish to clone to GIT
8. Add description as needed
9. Configuration : Public, ReadME OFF, No .gitignore, No license
10. Click "Create repository"
11. On next page, under "...or push an existing repository from the command line". Copy those terminal commands
12. Paste and execute terminal commands
13. This will run a bunch of commands in the terminal, wait till there complete. 
14. Repository should now be visible in your GitHub page.


Creating a GitHub Pages : 
https://www.youtube.com/watch?v=5XhxR9Vs6zc&list=PL4LCPTX7C8QHlln0FzaXAE50rlvdZlBnn&index=9&t=236s

1. Inside your repository, click Settings in the top navigation bar.
2. Find Pages in the left-hand sidebar. It is usually under the Code and automation section.
3. Under Build and deployment, select:
- Source: Deploy from a branch
- Branch: main
- Folder: /(root)
- Click Save.
4. That's it! You generally do not need to switch the branch to None and back again, as the video suggests. Selecting main and /(root) and saving should be enough for a standard website.
5. Wait a minute or two for GitHub to publish your website. Then return to Settings → Pages.
- GitHub should display a message saying your site is live, along with a link.
- Your website address will look like this: https://gabygarcia86.github.io/my-first-website/
- Replace my-first-website with your repository name.
6. After Committing and Sync your updates to your repository, look under Actions tab in the Github repository site page to see the progress.
