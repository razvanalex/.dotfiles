# .dotfiles

## Quick install
Run the following command to install dependencies, kitty, nvim, and others:
``` bash
curl -L https://raw.githubusercontent.com/razvanalex/.dotfiles/main/install | bash
```

## Manual Installation 

To start fresh, clone the dotfiles:
``` bash
git clone --recurse-submodules https://github.com/razvanalex/.dotfiles.git 
```

Then, use GNU stow to install the dotfiles. In addition, you need to install a
NERDFont and the packages. The installation script installs all directories
from the repository, and the packages for Ubuntu-based and RHEL-based systems.

## Local Configs

Use `.profile` or `.zprofile` to set local env variables.
