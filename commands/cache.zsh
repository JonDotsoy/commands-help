#
# Make a cache of the output
#
cache() {
    args=($@)
    reset=false

    if [[ ${args[1]} = '-r' ]]; then
        args=${args[@]:1}
        reset=true
    fi

    echo echo $PWD $args[@]
    hash=$(echo $PWD $args[@] | shasum -a 512 | head -c 128)

    tmpfile=$TMPDIR/$hash.out
    tmpfile_err=$TMPDIR/$hash.err

    # echo File $tmpfile

    if [[ $reset = true ]]; then
        echo Removing $tmpfile
        rm $tmpfile
    fi

    if [[ -f $tmpfile ]]; then
        cat $tmpfile
        return 0
    fi

    $args[@] >$tmpfile 2>$tmpfile_err
    exit_code=$?

    cat $tmpfile_err
    cat $tmpfile
}
