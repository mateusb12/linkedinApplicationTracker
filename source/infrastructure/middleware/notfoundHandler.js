module.exports = (req, res) => {
    res.status(404).send('Sorry, that route does not exist.');
};