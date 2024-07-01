# Underware
... and pants

A lightweight vanilla NodeJS microservicing platform. Each pair of "pants" are the building blocks for the services, and are meant to be modular and expandable.

### Installing on Linux
There are two methods to get Underware setup and running on linux

#### NPM scripts (with sudo)
coming soon

#### Manual
Painful, however allows you to run Underware with out root access (still does require root access, but from your part not a script).
```bash
#install
npm install underware

#start (from within project root)
underware -http <port> -https <port>[ -u <uid>]
```
The start command changes slightly since you have to route port 80 and 443 to a port above 1024 to get around root. Optionally you can supply a uid for underware to use for services otherwise it will run as user (still not recommended).
```bash
#your homework:
#redirect port traffic (not the only way, but the easiest)
sudo iptables -t nat -A PREROUTING -i <interface> -p tcp --dport 80 -j REDIRECT --to-port <destination>
sudo iptables -t nat -A PREROUTING -i <interface> -p tcp --dport 443 -j REDIRECT --to-port <destination>

#create underware user (if using)
sudo useradd -u <uid> underware
```
As long as underware gets this uid, it is up to you to deescalate permissions.

### Installing on Windows
Since privileged ports and user traversal are not existent in windows, the process is automated regardless.
```bash
#install
npm install underware

#start (from within project root)
underware
```

### Important Notes
- On windows you cant run-as so any operations done, will be done with your permissions.
- Under no circumstance should the bulk of this script be run with root, there is a kill clause to prevent this DO NOT OVERRIDE!
- Root is only being requested to listen on priveleged ports and set up a low permission user (on linux). Permissions are dropped before any actual operations are done.
- pants-slacks package uses eval for templating. If you opt to use this feature be aware of the danger and design around it. This is the main reason a lower permission user is recommended.


### What's in the Box?
- **jeans** - basic service meant to be long running
- **shorts** - start when needed, do their job, exit
- **pjs** - same thing as shorts, but in response to a clock

