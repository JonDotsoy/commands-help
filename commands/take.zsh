#
# Make a directory and move into
#
take() {
    endDirectory=$1
    echo endDirectory=$endDirectory
    if [[ -z $endDirectory ]]; then
        echo Require one argument
        return 1
    fi
    if [[ ! -d $endDirectory ]]; then
        mkdir -p $endDirectory
    fi
    cd $endDirectory
}
