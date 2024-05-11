# .dotfiles

## Quick install
Run the following command to install dependencies, kitty, nvim, and others:
``` bash
curl -L https://raw.githubusercontent.com/razvanalex/.dotfiles/main/.bin/install.sh | bash
```

## Download configs
To start fresh, download the dotfiles:
``` bash
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
git clone --bare git@github.com:razvanalex/.dotfiles.git $HOME/.dotfiles
dotfiles config --local status.showUntrackedFiles no
dotfiles checkout
```

## Initial Setup
> Extracted from this [Medium article](https://medium.com/@simontoth/best-way-to-manage-your-dotfiles-2c45bb280049).

Create the `.dotfiles` and an alias to the git command. 
``` bash
mkdir .dotfiles
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
echo !! >> ~/.zshrc
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
echo !! >> ~/.bashrc
```

Init the repo and don't show untracked files. 
``` bash
dotfiles init
dotfiles config --local status.showUntrackedFiles no
```

Create main branch:
``` bash
dotfiles branch -M main
```

Add files, then commit:
``` bash
dotfiles add <files>
dotfiles commit
```

The rest of the flow is as using `git` to setup and push to remote.

## Local setup

Use `.profile` or `.zprofile` to set local env variables.

