# .dotfiles

## Download config
To start fresh, download the dotfiles:
``` bash
alias dotfiles='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
git clone --bare git@github.com:HappyCerberus/dotfiles-demo.git $HOME/.dotfiles
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
dotfiles commit -m <message>
```
> Note: it also works to use `git commit` and use a proper text editor to write the commit message.

The rest of the flow is as using `git` to setup and push to remote.
