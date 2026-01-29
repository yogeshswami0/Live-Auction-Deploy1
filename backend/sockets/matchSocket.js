module.exports = (io) => {
    io.on("connection", (socket) => {
        socket.on("schedule:update", (eventId) => {
            socket.broadcast.emit("schedule:refresh", eventId);
        });
    });
};
