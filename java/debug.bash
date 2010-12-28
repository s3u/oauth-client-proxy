#!/usr/bin/env bash
function die() {
  echo $*
  exit 1
}

mvn package -Dmaven.test.skip=true || die "Could not package"

fullPath=`dirname $0`
jar=`find $fullPath/target/*with-dependencies.jar`
cp=`echo $jar | sed 's,./,'$fullPath'/,'`
javaArgs="-server -Xmx600m -jar "$cp" $*"
debugArgs="-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5005"

echo "Running using Java on path at `which java` with args $javaArgs"
java $debugArgs $javaArgs || die "Java process exited abnormally"
